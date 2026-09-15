/**
 * Email transport.
 *
 * Outbound goes through Resend's HTTP API — no SMTP library, so nothing new to
 * install and nothing to keep alive between requests. Inbound arrives as a
 * webhook from whichever provider routes the mailbox; the shapes differ per
 * provider, so `parseInbound` normalises the handful that matter.
 */

export async function sendEmail({ apiKey, from, fromName, to, subject, text, replyTo }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromName ? `${fromName} <${from}>` : from,
      to: [to],
      subject,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: json?.message || json?.error?.message || `Resend returned ${res.status}` };
  }
  return { ok: true, messageId: json?.id };
}

/** "Jane Doe <jane@x.com>" → { address, name } */
export function parseAddress(value) {
  if (!value) return { address: null, name: null };
  if (typeof value === "object") {
    return { address: value.address || value.email || null, name: value.name || null };
  }
  const match = String(value).match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) return { address: match[2].trim().toLowerCase(), name: match[1].trim() || null };
  return { address: String(value).trim().toLowerCase(), name: null };
}

/**
 * Strip the quoted history off a reply.
 *
 * Without this every round trip re-sends the whole thread to the model, which
 * both costs tokens and confuses it into answering old questions again.
 */
export function stripQuoted(body) {
  if (!body) return "";
  const lines = String(body).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;                                  // quoted block
    if (/^\s*-{2,}\s*Original Message\s*-{2,}/i.test(line)) break;  // Outlook
    if (/^\s*On .+ wrote:\s*$/.test(line)) break;                   // Gmail/Apple
    if (/^\s*_{10,}\s*$/.test(line)) break;                         // Outlook divider
    out.push(line);
  }
  return out.join("\n").trim();
}

/**
 * Normalise a provider's inbound payload.
 *
 * Covers Resend, Postmark, SendGrid Inbound Parse and Mailgun. Returns null
 * when the body carries no usable message.
 */
export function parseInbound(payload) {
  if (!payload || typeof payload !== "object") return null;

  // Resend wraps the mail in an event envelope.
  const d = payload.data && payload.type ? payload.data : payload;

  const rawFrom =
    d.from ?? d.From ?? d.sender ?? d.envelope?.from ?? payload.from;
  const { address: fromAddress, name: fromNameParsed } = parseAddress(
    typeof rawFrom === "object" ? rawFrom : rawFrom,
  );

  const fromName =
    d.FromName || d.FromFull?.Name || fromNameParsed || null;

  const subject = d.subject ?? d.Subject ?? "";

  const body =
    d.text ??
    d.TextBody ??
    d["body-plain"] ??
    d.plain ??
    (typeof d.html === "string" ? d.html.replace(/<[^>]+>/g, " ") : null) ??
    d.HtmlBody?.replace(/<[^>]+>/g, " ") ??
    "";

  const text = stripQuoted(body);
  const emailId = d.email_id || null;
  if (!fromAddress) return null;
  if (!text && !emailId) return null;

  return {
    fromAddress,
    fromName,
    subject: subject || "(no subject)",
    text,
    emailId,
    messageId: d.message_id || d.MessageID || d.MessageId || d["Message-Id"] || null,
  };
}

/**
 * Fetch the body of a received message.
 *
 * Only needed for providers whose webhook omits it. Returns null on failure so
 * the caller can decide whether an empty message is still worth recording.
 */
export async function fetchInboundBody({ apiKey, emailId }) {
  const res = await fetch(`https://api.resend.com/emails/inbound/${emailId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;

  const mail = await res.json().catch(() => null);
  if (!mail) return null;

  const body =
    mail.text ||
    (typeof mail.html === "string" && !mail.html.startsWith("data:")
      ? mail.html.replace(/<[^>]+>/g, " ")
      : "");

  return { text: stripQuoted(body), subject: mail.subject || null };
}

/** `email:<channelId>:<address>` → the customer's address. */
export function emailAddressOf(conversation) {
  const parts = (conversation?.external_session_id || "").split(":");
  return parts.length >= 3 ? parts.slice(2).join(":") : null;
}

/** Keep one thread in the customer's client instead of N new ones. */
export function replySubject(subject) {
  const s = (subject || "").trim();
  if (!s) return "Re:";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}
