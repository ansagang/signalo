/**
 * WhatsApp Cloud API transport (Meta Graph API).
 *
 * A channel needs three things from the Meta app: a permanent access token, the
 * phone number id it sends from, and an app secret so we can prove an inbound
 * POST really came from Meta.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

async function graph({ token, phoneNumberId, body }) {
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: json?.error?.message || `WhatsApp returned ${res.status}` };
  }
  return { ok: true, messageId: json?.messages?.[0]?.id };
}

export function sendWhatsAppText({ token, phoneNumberId, to, text }) {
  // WhatsApp hard-caps a body at 4096 characters and rejects the whole message
  // if it is longer, so trim rather than lose the reply entirely.
  const body = text.length > 4096 ? `${text.slice(0, 4093)}...` : text;
  return graph({
    token,
    phoneNumberId,
    body: { to, type: "text", text: { preview_url: false, body } },
  });
}

export function sendWhatsAppImage({ token, phoneNumberId, to, link, caption }) {
  return graph({
    token,
    phoneNumberId,
    body: { to, type: "image", image: { link, caption: caption?.slice(0, 1024) } },
  });
}

/**
 * Mark the customer's message read and show the typing bubble.
 *
 * Purely cosmetic — a failure here must never stop the reply, so callers can
 * ignore the result.
 */
export function markReadAndTyping({ token, phoneNumberId, messageId }) {
  return fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: { type: "text" },
    }),
  }).catch(() => {});
}

/**
 * Verify Meta's X-Hub-Signature-256 over the raw body.
 *
 * Node's timingSafeEqual throws on length mismatch, hence the length guard
 * before the comparison.
 */
export async function verifySignature({ appSecret, rawBody, header }) {
  if (!appSecret) return true; // not configured — the channel id is the only gate
  if (!header?.startsWith("sha256=")) return false;

  const { createHmac, timingSafeEqual } = await import("crypto");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const got = header.slice("sha256=".length);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got, "utf8"), Buffer.from(expected, "utf8"));
}

/** `whatsapp:<channelId>:<wa_id>` → the customer's phone number. */
export function whatsappNumber(conversation) {
  const parts = (conversation?.external_session_id || "").split(":");
  return parts.length >= 3 ? parts[2] : null;
}
