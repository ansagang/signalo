import { createServiceClient } from "@/lib/supabase/service";
import { ensureConversation, runChatToString } from "@/lib/ai/engine";
import { tzForUser } from "@/lib/timezone";
import { handoffState, releaseHandoff } from "@/lib/ai/handoff";
import { channelStrings } from "@/lib/widget-language";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Telegram inbound webhook.
 *
 * Telegram authenticates itself with the secret we handed it at setWebhook
 * time; the channel id in the path alone is not proof of anything.
 */
export async function POST(request, { params }) {
  const { channelId } = await params;
  const supabase = createServiceClient();

  const { data: channel } = await supabase
    .from("channels")
    .select("id, user_id, persona_id, secrets, is_active, type")
    .eq("id", channelId)
    .eq("type", "telegram")
    .maybeSingle();

  // Always 200 to Telegram — a non-2xx makes it retry the same update forever.
  const ok = () => Response.json({ ok: true });

  if (!channel || !channel.is_active) return ok();

  const expected = channel.secrets?.webhook_secret;
  const provided = request.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || provided !== expected) {
    return Response.json({ ok: false }, { status: 401 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return ok();
  }

  const message = update.message;
  const text = message?.text?.trim();
  const chatId = message?.chat?.id;
  if (!text || !chatId) return ok();

  const token = channel.secrets?.bot_token;
  if (!token) return ok();

  const api = async (method, body) => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!json.ok) console.error(`telegram ${method}:`, json.description || res.status);
      return json;
    } catch (err) {
      console.error(`telegram ${method}:`, err?.message || err);
      return { ok: false };
    }
  };

  const send = (body) => api("sendMessage", body);

  /**
   * Turn the assistant's `show_items` cards into real Telegram photos.
   * The web widget renders cards itself; Telegram has no such surface, so the
   * pictures have to be pushed as an album (or a single photo).
   */
  async function sendCards(cards) {
    const caption = (c) => {
      const price = Number(c.price || 0);
      const bits = [c.name];
      if (price > 0) bits.push(`${price.toLocaleString("en-US")} ${String(c.currency || "").toUpperCase()}`);
      if (c.kind === "service" && c.duration_min) bits.push(`${c.duration_min} min`);
      return bits.join(" — ");
    };

    const withPhotos = cards.filter((c) => c.image_url);
    const withoutPhotos = cards.filter((c) => !c.image_url);

    if (withPhotos.length === 1) {
      const only = withPhotos[0];
      const sent = await api("sendPhoto", { photo: only.image_url, caption: caption(only) });
      // A URL Telegram cannot fetch should still reach the customer as text.
      if (!sent?.ok) await api("sendMessage", { text: caption(only) });
    } else if (withPhotos.length > 1) {
      // sendMediaGroup takes 2–10 items and is one message in the chat.
      const batch = withPhotos.slice(0, 10);
      const sent = await api("sendMediaGroup", {
        media: batch.map((c) => ({ type: "photo", media: c.image_url, caption: caption(c) })),
      });
      if (!sent?.ok) {
        await api("sendMessage", { text: batch.map((c) => `• ${caption(c)}`).join("\n") });
      }
    }

    if (withoutPhotos.length) {
      await api("sendMessage", {
        text: withoutPhotos.map((c) => `• ${caption(c)}`).join("\n"),
      });
    }
  }

  const { data: persona } = await supabase
    .from("personas")
    .select("*")
    .eq("id", channel.persona_id)
    .eq("user_id", channel.user_id)
    .maybeSingle();

  if (!persona) return ok();

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    }).catch(() => {});

    const name = [message.from?.first_name, message.from?.last_name]
      .filter(Boolean)
      .join(" ");

    const conversation = await ensureConversation({
      supabase,
      userId: channel.user_id,
      personaId: persona.id,
      channel: "telegram",
      channelId: channel.id,
      sessionId: `telegram:${channel.id}:${chatId}`,
      customerIdentifier: message.from?.username
        ? `@${message.from.username}`
        : String(chatId),
      customerName: name || null,
      locale: message.from?.language_code || null,
    });

    // Stay out of the way while a person is working, but come back once they
    // have finished — otherwise one escalation mutes this customer for life.
    const handoff = await handoffState(supabase, conversation);
    if (!handoff.reply) {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "customer",
        content: text,
        channel: "telegram",
        channel_msg_id: String(message.message_id),
      });
      return ok();
    }
    if (handoff.release) await releaseHandoff(supabase, conversation.id);

    const { text: reply, events } = await runChatToString({
      supabase,
      userId: channel.user_id,
      persona,
      conversation,
      userMessage: text,
      channel: "telegram",
      timezone: await tzForUser(supabase, channel.user_id),
    });

    // Photos first, so the text that references them lands underneath.
    for (const event of events) {
      if (event.type === "cards") await sendCards(event.cards);
    }

    if (reply?.trim()) await send({ text: reply });
  } catch (err) {
    await send({
      text: (await channelStrings(supabase, channel.user_id, message.from?.language_code)).wentWrong,
    });
    console.error("telegram webhook", err);
  }

  return ok();
}
