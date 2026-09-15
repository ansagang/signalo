import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { ensureConversation, runChat } from "@/lib/ai/engine";
import { tzForUser } from "@/lib/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, ngrok-skip-browser-warning",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

function bad(message, status = 400) {
  return Response.json({ success: false, message }, { status, headers: CORS });
}

/**
 * Resolve who the customer is talking to.
 *
 * Public path: a channel public_key from the widget. The key is the only thing
 * we trust from the browser — user_id and persona_id come off the channel row.
 *
 * Playground path: a logged-in dashboard session picking one of its own
 * personas. Never accepts a user_id from the request body.
 */
async function resolveTarget(body) {
  if (body.public_key) {
    const supabase = createServiceClient();
    const { data: channel } = await supabase
      .from("channels")
      .select("id, user_id, persona_id, type, is_active, config")
      .eq("public_key", body.public_key)
      .maybeSingle();

    if (!channel) return { error: "Unknown channel." };
    if (!channel.is_active) return { error: "This assistant is currently offline." };

    const { data: persona } = await supabase
      .from("personas")
      .select("*")
      .eq("id", channel.persona_id)
      .eq("user_id", channel.user_id)
      .maybeSingle();

    if (!persona) return { error: "This channel has no persona attached yet." };

    return { supabase, userId: channel.user_id, persona, channel };
  }

  // Playground
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized.", status: 401 };

  if (!body.persona_id) return { error: "persona_id is required." };

  const { data: persona } = await supabase
    .from("personas")
    .select("*")
    .eq("id", body.persona_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!persona) return { error: "Persona not found." };

  return { supabase, userId: user.id, persona, channel: null, playground: true };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON body.");
  }

  const message = (body.message || "").trim();
  if (!message) return bad("message is required.");
  if (message.length > 4000) return bad("Message is too long.");

  const target = await resolveTarget(body);
  if (target.error) return bad(target.error, target.status || 400);

  const { supabase, userId, persona, channel, playground } = target;
  // channels.type is 'web' | 'telegram'; conversations.channel speaks
  // 'webchat' | 'telegram' | 'playground'. Translate at the boundary.
  const channelType = playground
    ? "playground"
    : channel.type === "web"
      ? "webchat"
      : channel.type;

  const sessionId =
    body.session_id ||
    `${channelType}:${persona.id}:${crypto.randomUUID()}`;

  let conversation;
  try {
    conversation = await ensureConversation({
      supabase,
      userId,
      personaId: persona.id,
      channel: channelType,
      channelId: channel?.id || null,
      sessionId,
      customerIdentifier: body.customer_identifier || sessionId,
      customerName: body.customer_name || null,
      locale: body.locale || null,
    });
  } catch (err) {
    return bad(err?.message || "Could not start the conversation.", 500);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      send({ type: "session", session_id: sessionId, conversation_id: conversation.id });

      try {
        for await (const event of runChat({
          supabase,
          userId,
          persona,
          conversation,
          userMessage: message,
          channel: channelType,
          timezone: await tzForUser(supabase, userId),
        })) {
          send(event);
        }
      } catch (err) {
        send({ type: "error", message: err?.message || "The assistant failed to reply." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
