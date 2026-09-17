import { DEFAULT_TZ } from "@/lib/timezone";
import Anthropic from "@anthropic-ai/sdk";
import { resolveModel } from "./models";
import { retrieveContext, formatContext } from "./retrieval";
import { buildPersonaPrompt, buildContextPrompt } from "./persona";
import { anthropicTools, runTool } from "./tools";
import { recordUsage, canSpend } from "@/lib/services/billing";
import { mustTryBeforeEscalating } from "@/lib/ai/handoff";

const MAX_TOOL_TURNS = 5;
const HISTORY_LIMIT = 24;

let _anthropic;

function anthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
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

async function* streamAnthropic({ model, system, messages, persona, ctx, meter }) {
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

    // Every turn of the tool loop is its own billable call. Cache reads and
    // writes are priced differently, so they are counted separately.
    if (message.usage) {
      meter.add({
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
        cacheWrite: message.usage.cache_creation_input_tokens,
        cacheRead: message.usage.cache_read_input_tokens,
      });
    }

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

/**
 * What the assistant actually did this turn, in a form the inbox can show.
 *
 * A transcript that reads "Sure, you're booked!" with nothing behind it makes
 * an operator open the calendar to check. Recording the real outcome next to
 * the reply means the conversation itself says whether a booking exists.
 *
 * Only outcomes, never the card carousel — that is already visible as the
 * message it decorates.
 */
function actionsFrom(events) {
  const actions = [];
  for (const e of events) {
    if (e.type === "appointment" && e.appointment) {
      actions.push({ kind: "booked", at: e.appointment.starts_at, id: e.appointment.id });
    } else if (e.type === "rescheduled" && e.appointment) {
      actions.push({ kind: "moved", at: e.appointment.starts_at, id: e.appointment.id });
    } else if (e.type === "cancelled" && e.appointment) {
      actions.push({ kind: "cancelled", at: e.appointment.starts_at, id: e.appointment.id });
    } else if (e.type === "order" && e.order) {
      actions.push({ kind: "order", total: e.order.total, currency: e.order.currency, id: e.order.id });
    } else if (e.type === "handoff") {
      actions.push({ kind: "handoff", reason: e.reason || null });
    }
  }
  return actions.length ? actions : undefined;
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
  timezone = DEFAULT_TZ,
}) {
  const model = resolveModel(persona.model);
  const events = [];

  const ctx = {
    supabase,
    userId,
    conversationId: conversation.id,
    // The whole row, because request_human has to know whether a colleague
    // has just handed this back on purpose.
    conversation,
    timezone,
    // Who this customer is allowed to act on behalf of. On a channel that
    // proves identity their address counts; on the web widget only this
    // conversation does.
    scope: {
      conversationId: conversation.id,
      identifier: conversation.customer_identifier || null,
      channel,
    },
    onEvent: (e) => events.push(e),
  };

  await saveMessage(supabase, {
    conversationId: conversation.id,
    role: "customer",
    content: userMessage,
    channel,
  });

  // Out of credits: record what the customer said, hand the conversation to a
  // human and stop. Ignoring them is what loses the sale, not the unpaid bill.
  const spend = await canSpend(supabase, userId);
  if (!spend.ok) {
    await supabase
      .from("conversations")
      .update({
        handoff: true,
        handoff_at: new Date().toISOString(),
        status: "escalated",
        last_intent: "out_of_credits",
      })
      .eq("id", conversation.id);

    yield { type: "paused", reason: "out_of_credits", balance: spend.balance };
    yield { type: "done", text: "", conversation_id: conversation.id, paused: true };
    return;
  }

  const history = await loadHistory(supabase, conversation.id);

  // What this customer already has, so the assistant never denies a booking it
  // made itself a few messages ago.
  let record = null;
  try {
    const [{ data: appointments }, { data: orders }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, starts_at, status, party_size, services(name), resources(name)")
        .eq("user_id", userId)
        .eq("conversation_id", conversation.id)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: true })
        .limit(10),
      supabase
        .from("orders")
        .select("items, total, currency, status")
        .eq("user_id", userId)
        .eq("conversation_id", conversation.id)
        .neq("status", "cancelled")
        .order("created_at", { ascending: true })
        .limit(10),
    ]);
    record = { appointments: appointments || [], orders: orders || [] };
  } catch {
    // Worth answering without, never worth failing the turn over.
    record = null;
  }

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
    {
      type: "text",
      text: buildContextPrompt(persona, contextBlock, {
        timezone,
        record,
        handedBack: await mustTryBeforeEscalating(supabase, conversation),
      }),
    },
  ];

  // Tokens add up across every turn of the tool loop, then bill once.
  const meter = {
    input: 0, output: 0, cacheWrite: 0, cacheRead: 0,
    add({ input, output, cacheWrite, cacheRead } = {}) {
      this.input += input || 0;
      this.output += output || 0;
      this.cacheWrite += cacheWrite || 0;
      this.cacheRead += cacheRead || 0;
    },
  };

  const args = { model, system, messages: history, persona, ctx, meter };
  const iterator = streamAnthropic(args);

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
      metadata: { model: model.id, actions: actionsFrom(events) },
    });
  }

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);

  // Charge last, and never let billing break a conversation that already
  // happened — an unrecorded credit is cheaper than a lost customer.
  let charged = null;
  if (meter.input || meter.output || meter.cacheRead) {
    try {
      charged = await recordUsage(supabase, userId, {
        model: model.id,
        inputTokens: meter.input,
        outputTokens: meter.output,
        cacheWriteTokens: meter.cacheWrite,
        cacheReadTokens: meter.cacheRead,
        kind: "chat",
        conversationId: conversation.id,
        channel,
      });
    } catch (err) {
      console.error("recordUsage", err?.message || err);
    }
  }

  yield {
    type: "done",
    text,
    conversation_id: conversation.id,
    usage: { input: meter.input, output: meter.output, credits: charged?.credits ?? 0 },
  };
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
