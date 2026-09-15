import { createServiceClient } from "@/lib/supabase/service";
import { ensureConversation, runChatToString } from "@/lib/ai/engine";
import { sendEmail, parseInbound, replySubject } from "@/lib/channels/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inbound email, posted by whichever provider routes the mailbox.
 *
 * The path alone proves nothing, so the channel's inbound secret has to come
 * back either as a bearer token or as ?secret= — whichever the provider can
 * actually send.
 */
export async function POST(request, { params }) {
  const { channelId } = await params;
  const supabase = createServiceClient();
  const ok = () => Response.json({ ok: true });

  const { data: channel } = await supabase
    .from("channels")
    .select("id, user_id, persona_id, secrets, config, is_active, type")
    .eq("id", channelId)
    .eq("type", "email")
    .maybeSingle();

  if (!channel || !channel.is_active) return ok();

  const expected = channel.secrets?.inbound_secret;
  const url = new URL(request.url);
  const provided =
    url.searchParams.get("secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    request.headers.get("x-signalo-secret");

  if (!expected || provided !== expected) {
    return Response.json({ ok: false }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return ok();
  }

  const mail = parseInbound(payload);
  if (!mail) return ok();

  const apiKey = channel.secrets?.api_key || process.env.RESEND_API_KEY;
  const address = channel.config?.address;
  if (!address) return ok();

  // Never answer ourselves: a bounce or an autoresponder loop would otherwise
  // ping-pong until someone notices the bill.
  if (mail.fromAddress === String(address).toLowerCase()) return ok();

  const { data: persona } = await supabase
    .from("personas")
    .select("*")
    .eq("id", channel.persona_id)
    .eq("user_id", channel.user_id)
    .maybeSingle();

  if (!persona) return ok();

  const reply = (text, subject) =>
    sendEmail({
      apiKey,
      from: address,
      fromName: channel.config?.from_name || persona.name,
      to: mail.fromAddress,
      subject: replySubject(subject ?? mail.subject),
      text,
    });

  try {
    const conversation = await ensureConversation({
      supabase,
      userId: channel.user_id,
      personaId: persona.id,
      channel: "email",
      channelId: channel.id,
      sessionId: `email:${channel.id}:${mail.fromAddress}`,
      customerIdentifier: mail.fromAddress,
      customerName: mail.fromName,
      locale: null,
    });

    // A human has taken this over, or we have no way to send yet. Either way
    // the message still belongs in the inbox for someone to pick up.
    if (conversation.handoff || !apiKey) {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "customer",
        content: mail.text,
        channel: "email",
        channel_msg_id: mail.messageId,
      });
      return ok();
    }

    // The subject carries real intent ("Booking for Friday?"), so give it to
    // the model rather than throwing it away.
    const userMessage = mail.subject && mail.subject !== "(no subject)"
      ? `${mail.subject}\n\n${mail.text}`
      : mail.text;

    const { text: answer, events } = await runChatToString({
      supabase,
      userId: channel.user_id,
      persona,
      conversation,
      userMessage,
      channel: "email",
    });

    // Email has no card surface; append the links so nothing is lost.
    let body = answer || "";
    for (const event of events) {
      if (event.type !== "cards") continue;
      const lines = event.cards.map((c) => {
        const price = Number(c.price || 0);
        const bits = [c.name];
        if (price > 0) bits.push(`${price.toLocaleString("en-US")} ${String(c.currency || "").toUpperCase()}`);
        if (c.image_url) bits.push(c.image_url);
        return `• ${bits.join(" — ")}`;
      });
      if (lines.length) body += `\n\n${lines.join("\n")}`;
    }

    if (body.trim()) await reply(body);
  } catch (err) {
    await reply(
      "Извините, что-то пошло не так. Коллега свяжется с вами.\n\nSorry, something went wrong — a colleague will follow up.",
    );
    console.error("email webhook", err);
  }

  return ok();
}
