import { createServiceClient } from "@/lib/supabase/service";
import { ensureConversation, runChatToString } from "@/lib/ai/engine";
import { tzForUser } from "@/lib/timezone";
import { handoffState, releaseHandoff } from "@/lib/ai/handoff";
import { channelStrings } from "@/lib/widget-language";
import {
  sendInstagramText, sendInstagramImage, markSeenAndTyping, verifySignature,
  readMessage, hostFor,
} from "@/lib/channels/instagram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta lets an app register exactly one Instagram callback URL, so a
 * deployment serving several accounts cannot give each its own path. Posting
 * to `/api/channels/instagram/app` resolves the channel from the account id
 * in the payload instead; the per-channel URL still works for anyone who set
 * one up by hand.
 */
const FANOUT = "app";

/** Meta's handshake: it calls this once when the callback URL is saved. */
export async function GET(request, { params }) {
  const { channelId } = await params;
  const url = new URL(request.url);

  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token) return new Response("Bad request", { status: 400 });

  const echo = () =>
    new Response(challenge || "", { status: 200, headers: { "Content-Type": "text/plain" } });

  if (channelId === FANOUT) {
    return process.env.META_VERIFY_TOKEN && token === process.env.META_VERIFY_TOKEN
      ? echo()
      : new Response("Forbidden", { status: 403 });
  }

  const supabase = createServiceClient();
  const { data: channel } = await supabase
    .from("channels")
    .select("secrets")
    .eq("id", channelId)
    .eq("type", "instagram")
    .maybeSingle();

  if (!channel || channel.secrets?.verify_token !== token) {
    return new Response("Forbidden", { status: 403 });
  }
  return echo();
}

/**
 * Instagram inbound.
 *
 * Same contract as the other Meta hooks: always answer 200, or Meta retries
 * the delivery for hours and eventually unsubscribes the account.
 */
export async function POST(request, { params }) {
  const { channelId } = await params;
  const supabase = createServiceClient();
  const ok = () => Response.json({ ok: true });

  // The signature covers the exact bytes, so read text before parsing.
  const raw = await request.text();

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return ok();
  }

  const entry = payload?.entry?.[0];
  const messaging = entry?.messaging?.[0] || entry?.standby?.[0];
  // Reactions, read receipts and delivery marks arrive on the same hook.
  if (!messaging?.message) return ok();

  // On the fan-out path the account id in the payload names the channel; on a
  // per-channel URL the path already did.
  const query = supabase
    .from("channels")
    .select("id, user_id, persona_id, secrets, config, is_active, type")
    .eq("type", "instagram");

  const { data: channel } = await (channelId === FANOUT
    ? query.eq("secrets->>ig_id", String(entry.id)).maybeSingle()
    : query.eq("id", channelId).maybeSingle());

  if (!channel || !channel.is_active) return ok();

  const valid = await verifySignature({
    appSecret: channel.secrets?.app_secret || process.env.META_APP_SECRET,
    rawBody: raw,
    header: request.headers.get("x-hub-signature-256"),
  });
  if (!valid) return Response.json({ ok: false }, { status: 401 });

  const token = channel.secrets?.access_token;
  const igId = channel.secrets?.ig_id || String(entry.id);
  const login = channel.secrets?.login || "facebook";
  const from = messaging.sender?.id;

  // An echo is our own outbound DM coming back; the account messaging itself
  // is the same loop by another route.
  if (!token || !igId || !from || from === igId) return ok();

  const { text, kind } = readMessage(messaging);
  if (kind === "echo") return ok();

  const send = (body) => sendInstagramText({ token, igId, login, to: from, ...body });

  // A voice note, a reel share or a sticker still deserves an answer.
  if (!text) {
    await send({
      text: (await channelStrings(supabase, channel.user_id, null)).textOnly,
    });
    return ok();
  }

  const { data: persona } = await supabase
    .from("personas")
    .select("*")
    .eq("id", channel.persona_id)
    .eq("user_id", channel.user_id)
    .maybeSingle();

  if (!persona) return ok();

  /** The widget draws `show_items` cards itself; Instagram needs real images. */
  async function sendCards(cards) {
    for (const c of cards.filter((x) => x.image_url).slice(0, 5)) {
      // No album type here either — image first, then its caption as text,
      // because an Instagram image attachment carries no caption of its own.
      await sendInstagramImage({ token, igId, login, to: from, link: c.image_url });
      const price = Number(c.price || 0);
      const bits = [c.name];
      if (price > 0) bits.push(`${price.toLocaleString("en-US")} ${String(c.currency || "").toUpperCase()}`);
      if (c.kind === "service" && c.duration_min) bits.push(`${c.duration_min} min`);
      await send({ text: bits.join(" — ") });
    }
  }

  try {
    markSeenAndTyping({ token, igId, login, to: from });

    const conversation = await ensureConversation({
      supabase,
      userId: channel.user_id,
      personaId: persona.id,
      channel: "instagram",
      channelId: channel.id,
      sessionId: `instagram:${channel.id}:${from}`,
      customerIdentifier: from,
      locale: null,
    });

    // The webhook carries only a scoped id, so the @handle is a separate
    // lookup — done once, when the inbox would otherwise show a number.
    if (!conversation.customer_name) {
      const username = await usernameFor({ token, igId, login, from });
      if (username) {
        conversation.customer_name = username;
        await supabase
          .from("conversations")
          .update({ customer_name: username })
          .eq("id", conversation.id);
      }
    }

    // Stay out of the way while a person is working, but come back once they
    // have finished — otherwise one escalation mutes this customer for life.
    const handoff = await handoffState(supabase, conversation);
    if (!handoff.reply) {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "customer",
        content: text,
        channel: "instagram",
        channel_msg_id: messaging.message.mid,
      });
      return ok();
    }
    if (handoff.release) await releaseHandoff(supabase, conversation.id);

    const { text: reply, events } = await runChatToString({
      supabase,
      userId: channel.user_id,
      persona,
      conversation,
      // A story reply reads as a non-sequitur without the context that the
      // customer is answering something the business posted.
      userMessage: kind === "story_reply" ? `[replying to your story] ${text}` : text,
      channel: "instagram",
      timezone: await tzForUser(supabase, channel.user_id),
    });

    for (const event of events) {
      if (event.type === "cards") await sendCards(event.cards);
    }

    if (reply?.trim()) await send({ text: reply });
  } catch (err) {
    await send({
      text: (await channelStrings(supabase, channel.user_id, null)).wentWrong,
    });
    console.error("instagram webhook", err);
  }

  return ok();
}

/**
 * The @handle behind a scoped id, so the inbox shows a person and not a number.
 *
 * Best effort: the lookup needs a permission the account may not have granted,
 * and a missing display name is never worth dropping a message over.
 */
async function usernameFor({ token, igId, login, from }) {
  try {
    const res = await fetch(`${hostFor(login)}/${from}?fields=username,name`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.username ? `@${json.username}` : json.name || null;
  } catch {
    return null;
  }
}
