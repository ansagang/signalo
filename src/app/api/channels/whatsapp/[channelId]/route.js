import { createServiceClient } from "@/lib/supabase/service";
import { ensureConversation, runChatToString } from "@/lib/ai/engine";
import { tzForUser } from "@/lib/timezone";
import {
  sendWhatsAppText, sendWhatsAppImage, markReadAndTyping, verifySignature,
} from "@/lib/channels/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta's webhook handshake. It calls this once when you save the callback URL
 * and expects the challenge echoed back as bare text.
 */
export async function GET(request, { params }) {
  const { channelId } = await params;
  const url = new URL(request.url);

  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token) return new Response("Bad request", { status: 400 });

  const supabase = createServiceClient();
  const { data: channel } = await supabase
    .from("channels")
    .select("secrets")
    .eq("id", channelId)
    .eq("type", "whatsapp")
    .maybeSingle();

  if (!channel || channel.secrets?.verify_token !== token) {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(challenge || "", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

/**
 * WhatsApp inbound.
 *
 * Same contract as the Telegram webhook: always answer 200, or Meta retries
 * the delivery for hours.
 */
export async function POST(request, { params }) {
  const { channelId } = await params;
  const supabase = createServiceClient();
  const ok = () => Response.json({ ok: true });

  // The signature is over the exact bytes, so read text before parsing.
  const raw = await request.text();

  const { data: channel } = await supabase
    .from("channels")
    .select("id, user_id, persona_id, secrets, is_active, type")
    .eq("id", channelId)
    .eq("type", "whatsapp")
    .maybeSingle();

  if (!channel || !channel.is_active) return ok();

  const valid = await verifySignature({
    appSecret: channel.secrets?.app_secret,
    rawBody: raw,
    header: request.headers.get("x-hub-signature-256"),
  });
  if (!valid) return Response.json({ ok: false }, { status: 401 });

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return ok();
  }

  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  // Delivery receipts and read markers arrive on the same hook; ignore them.
  if (!message) return ok();

  const from = message.from;
  const text =
    message.type === "text"
      ? message.text?.body?.trim()
      : message.type === "interactive"
        ? (message.interactive?.button_reply?.title ||
           message.interactive?.list_reply?.title || "").trim()
        : "";

  const token = channel.secrets?.access_token;
  const phoneNumberId = channel.secrets?.phone_number_id || value?.metadata?.phone_number_id;
  if (!from || !token || !phoneNumberId) return ok();

  const send = (body) => sendWhatsAppText({ token, phoneNumberId, to: from, ...body });

  // A voice note or a sticker still deserves an answer.
  if (!text) {
    await send({ text: "Пока я понимаю только текст. Напишите, пожалуйста, сообщением. / I can only read text for now — please type your message." });
    return ok();
  }

  const { data: persona } = await supabase
    .from("personas")
    .select("*")
    .eq("id", channel.persona_id)
    .eq("user_id", channel.user_id)
    .maybeSingle();

  if (!persona) return ok();

  /** The widget draws `show_items` cards itself; WhatsApp needs real images. */
  async function sendCards(cards) {
    const withPhotos = cards.filter((c) => c.image_url);
    for (const c of withPhotos.slice(0, 5)) {
      const price = Number(c.price || 0);
      const bits = [c.name];
      if (price > 0) bits.push(`${price.toLocaleString("en-US")} ${String(c.currency || "").toUpperCase()}`);
      if (c.kind === "service" && c.duration_min) bits.push(`${c.duration_min} min`);
      // No album type in the Cloud API — each image is its own message.
      await sendWhatsAppImage({
        token, phoneNumberId, to: from, link: c.image_url, caption: bits.join(" — "),
      });
    }
  }

  try {
    markReadAndTyping({ token, phoneNumberId, messageId: message.id });

    const conversation = await ensureConversation({
      supabase,
      userId: channel.user_id,
      personaId: persona.id,
      channel: "whatsapp",
      channelId: channel.id,
      sessionId: `whatsapp:${channel.id}:${from}`,
      customerIdentifier: `+${from}`,
      customerName: value?.contacts?.[0]?.profile?.name || null,
      locale: null,
    });

    // A human has taken this conversation over — stay quiet.
    if (conversation.handoff) {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "customer",
        content: text,
        channel: "whatsapp",
        channel_msg_id: message.id,
      });
      return ok();
    }

    const { text: reply, events } = await runChatToString({
      supabase,
      userId: channel.user_id,
      persona,
      conversation,
      userMessage: text,
      channel: "whatsapp",
      timezone: await tzForUser(supabase, channel.user_id),
    });

    for (const event of events) {
      if (event.type === "cards") await sendCards(event.cards);
    }

    if (reply?.trim()) await send({ text: reply });
  } catch (err) {
    await send({
      text: "Извините, что-то пошло не так. Коллега свяжется с вами. / Sorry, something went wrong — a colleague will follow up.",
    });
    console.error("whatsapp webhook", err);
  }

  return ok();
}
