import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { resolveModel } from "./models";
import { retrieveContext, formatContext } from "./retrieval";
import { buildPersonaPrompt, buildContextPrompt } from "./persona";
import { anthropicTools, openaiTools, runTool } from "./tools";

const MAX_TOOL_TURNS = 5;
const HISTORY_LIMIT = 24;

let _anthropic;
let _openai;

function anthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

function openai() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

/* ────────────────────────── conversation state ────────────────────────── */

export async function ensureConversation({
  supabase,
  userId,
  personaId,
  channel = "web",
  channelId = null,
  sessionId,
  customerIdentifier,
  customerName = null,
  locale = null,
}) {
  const identifier = customerIdentifier || sessionId;

  // Scope the lookup by owner as well as session id. Session ids come from
  // the browser, so without this a replayed id could attach a customer to a
  // different seller's conversation.
  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("external_session_id", sessionId)
    .eq("channel", channel)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      persona_id: personaId,
      channel,
      channel_id: channelId,
      external_session_id: sessionId,
      customer_identifier: identifier,
      customer_name: customerName,
      locale,
      status: "open",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function loadHistory(supabase, conversationId) {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) throw error;

  // The table's role vocabulary is customer/assistant/agent; the model's is
  // user/assistant. A human agent's reply is still "not the customer", so it
  // maps to assistant so the bot reads it as part of its own side.
  // Tool traffic is replayed per request rather than persisted as protocol.
  return (data || [])
    .reverse()
    .map((m) => ({
      role: m.role === "customer" ? "user" : "assistant",
      content: m.content,
    }));
}

async function saveMessage(supabase, { conversationId, role, content, channel, metadata }) {
  if (!content?.trim()) return;
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    role,
    content,
    channel,
    metadata: metadata || null,
  });
}

/* ──────────────────────────── provider loops ──────────────────────────── */

async function* streamAnthropic({ model, system, messages, persona, ctx }) {
  const client = anthropic();
  const tools = anthropicTools();
  const convo = [...messages];
  let fullText = "";

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const request = {
      model: model.id,
      max_tokens: Math.min(Math.max(Number(persona.max_tokens) || 1024, 256), 8192),
      system,
      messages: convo,
      tools,
    };

    // Opus 5 / Sonnet 5 reject temperature and budget_tokens outright; effort
    // is the supported dial. Haiku 4.5 accepts neither effort nor adaptive.
    if (model.effort) request.output_config = { effort: model.effort };

    const stream = client.messages.stream(request);
    let firstTextOfTurn = true;

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        // A tool call splits one reply into several turns. Without a break
        // here the tail of one turn runs straight into the head of the next
        // ("…case details.A colleague will…").
        if (firstTextOfTurn && fullText && !/\s$/.test(fullText)) {
          fullText += "\n\n";
          yield { type: "delta", text: "\n\n" };
        }
        firstTextOfTurn = false;

        fullText += event.delta.text;
        yield { type: "delta", text: event.delta.text };
      }
    }

    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      yield {
        type: "delta",
        text: "\n\nI can't help with that one — let me get a colleague.",
      };
      await runTool("request_human", { reason: "Model declined the request." }, ctx);
      break;
    }

    convo.push({ role: "assistant", content: message.content });

    const toolUses = message.content.filter((b) => b.type === "tool_use");
    if (message.stop_reason !== "tool_use" || !toolUses.length) break;

    const results = [];
    for (const block of toolUses) {
      yield { type: "tool", name: block.name };
      // Tool inputs may arrive with provider-specific JSON escaping — they are
      // already parsed objects here, never match against the raw string.
      const output = await runTool(block.name, block.input, ctx);
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(output),
        is_error: !output.ok,
      });
    }

    // All tool_results for one assistant turn go back in a single user message.
    convo.push({ role: "user", content: results });
  }

  return fullText;
}

async function* streamOpenAI({ model, system, messages, persona, ctx }) {
  const client = openai();
  const tools = openaiTools();
  const systemText = Array.isArray(system)
    ? system.map((b) => b.text).join("\n\n")
    : system;

  const convo = [
    { role: "system", content: systemText },
    ...messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : "",
    })),
  ];
  let fullText = "";

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const stream = await client.chat.completions.create({
      model: model.id,
      max_tokens: Math.min(Math.max(Number(persona.max_tokens) || 1024, 256), 8192),
      temperature: Number(persona.temperature ?? 0.7),
      messages: convo,
      tools,
      stream: true,
    });

    let text = "";
    const calls = [];
    let finish = null;
    let firstTextOfTurn = true;

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finish = choice.finish_reason;

      const delta = choice.delta || {};
      if (delta.content) {
        // Same turn-boundary break as the Anthropic loop.
        if (firstTextOfTurn && fullText && !/\s$/.test(fullText)) {
          fullText += "\n\n";
          yield { type: "delta", text: "\n\n" };
        }
        firstTextOfTurn = false;

        text += delta.content;
        fullText += delta.content;
        yield { type: "delta", text: delta.content };
      }

      for (const tc of delta.tool_calls || []) {
        const slot = (calls[tc.index] ||= { id: "", name: "", args: "" });
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.name = tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
      }
    }

    if (finish !== "tool_calls" || !calls.length) break;

    convo.push({
      role: "assistant",
      content: text || null,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: c.args || "{}" },
      })),
    });

    for (const call of calls) {
      yield { type: "tool", name: call.name };
      let input = {};
      try {
        input = JSON.parse(call.args || "{}");
      } catch {
        input = {};
      }
      const output = await runTool(call.name, input, ctx);
      convo.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(output),
      });
    }
  }

  return fullText;
}

/* ─────────────────────────────── entrypoint ───────────────────────────── */

/**
 * Run one customer turn end to end.
 *
 * Yields streaming events and persists both sides of the exchange. The caller
 * decides how to serialise the events (SSE for the widget, a single awaited
 * string for Telegram).
 */
export async function* runChat({
  supabase,
  userId,
  persona,
  conversation,
  userMessage,
  channel = "web",
  businessName,
  timezone = "Asia/Almaty",
}) {
  const model = resolveModel(persona.model);
  const events = [];

  const ctx = {
    supabase,
    userId,
    conversationId: conversation.id,
    timezone,
    onEvent: (e) => events.push(e),
  };

  await saveMessage(supabase, {
    conversationId: conversation.id,
    role: "customer",
    content: userMessage,
    channel,
  });

  const history = await loadHistory(supabase, conversation.id);

  let contextBlock;
  try {
    const retrieved = await retrieveContext({
      supabase,
      userId,
      personaId: persona.id,
      query: userMessage,
    });
    contextBlock = formatContext(retrieved);
  } catch (err) {
    // Retrieval failing must not take the conversation down with it — the bot
    // falls back to its "I don't know" behaviour instead.
    contextBlock = `Catalogue lookup failed (${err?.message || "unknown error"}). Treat the catalogue as empty.`;
  }

  const system = [
    {
      type: "text",
      text: buildPersonaPrompt(persona, { businessName }),
      cache_control: { type: "ephemeral" }, // stable half — cached across turns
    },
    { type: "text", text: buildContextPrompt(persona, contextBlock, { timezone }) },
  ];

  const args = { model, system, messages: history, persona, ctx };
  const iterator =
    model.provider === "openai" ? streamOpenAI(args) : streamAnthropic(args);

  let text = "";
  try {
    while (true) {
      const { value, done } = await iterator.next();
      if (done) {
        text = value || text;
        break;
      }
      if (value.type === "delta") text += value.text;
      yield value;
    }
  } catch (err) {
    yield { type: "error", message: err?.message || "The assistant failed to reply." };
    return;
  }

  for (const e of events) yield e;

  if (text.trim()) {
    await saveMessage(supabase, {
      conversationId: conversation.id,
      role: "assistant",
      content: text,
      channel,
      metadata: { model: model.id },
    });
  }

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);

  yield { type: "done", text, conversation_id: conversation.id };
}

/**
 * Non-streaming wrapper (Telegram, tests).
 *
 * Returns the side events too — a channel that can send photos needs to know
 * the assistant asked for cards, which a plain string would throw away.
 */
export async function runChatToString(options) {
  let text = "";
  const events = [];
  for await (const event of runChat(options)) {
    if (event.type === "delta") text += event.text;
    else if (event.type === "error") throw new Error(event.message);
    else events.push(event);
  }
  return { text, events };
}
