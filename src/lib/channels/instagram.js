/**
 * Instagram DM transport (Meta Messenger Platform for Instagram).
 *
 * A channel needs the Instagram professional account id, an access token that
 * can message on its behalf, and the app secret so an inbound POST can be
 * proven to come from Meta.
 *
 * Two sign-in routes produce two different hosts. Facebook Login hands back a
 * Page token used against graph.facebook.com; Instagram Login hands back an
 * Instagram token used against graph.instagram.com. The API shape is the same
 * either way, so the host is the only thing that varies.
 */

export { verifyMetaSignature as verifySignature } from "./meta.js";

const VERSION = process.env.META_API_VERSION || "v21.0";

/** Which Graph host this channel's token belongs to. */
export function hostFor(login) {
  return login === "instagram"
    ? `https://graph.instagram.com/${VERSION}`
    : `https://graph.facebook.com/${VERSION}`;
}

async function send({ token, igId, login, body }) {
  const res = await fetch(`${hostFor(login)}/${igId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = json?.error || {};
    // Outside the 24-hour window Instagram refuses everything, and the raw
    // message ("This message is sent outside of allowed window") tells an
    // operator nothing about what to do next.
    if (error.code === 10 || /outside.*window/i.test(error.message || "")) {
      return {
        ok: false,
        error:
          "Instagram only allows replies within 24 hours of the customer's last message. Ask them to write again.",
      };
    }
    return { ok: false, error: error.message || `Instagram returned ${res.status}` };
  }
  return { ok: true, messageId: json?.message_id };
}

export function sendInstagramText({ token, igId, login, to, text }) {
  // Instagram caps a DM at 1000 characters and rejects the whole message when
  // it is longer, so trim rather than lose the reply entirely.
  const body = text.length > 1000 ? `${text.slice(0, 997)}...` : text;
  return send({ token, igId, login, body: { recipient: { id: to }, message: { text: body } } });
}

export function sendInstagramImage({ token, igId, login, to, link }) {
  return send({
    token, igId, login,
    body: {
      recipient: { id: to },
      message: { attachment: { type: "image", payload: { url: link, is_reusable: true } } },
    },
  });
}

/**
 * Show the seen tick and the typing bubble.
 *
 * Cosmetic only — a failure here must never stop the reply, so callers can
 * ignore the result.
 */
export async function markSeenAndTyping({ token, igId, login, to }) {
  for (const action of ["mark_seen", "typing_on"]) {
    await fetch(`${hostFor(login)}/${igId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: to }, sender_action: action }),
    }).catch(() => {});
  }
}

/**
 * What a customer actually said, whatever form it arrived in.
 *
 * Story replies and shares carry the post alongside the text; an unwrapped
 * attachment with no text at all comes back empty so the caller can answer
 * honestly instead of replying to nothing.
 */
export function readMessage(messaging) {
  const m = messaging?.message;
  if (!m) return { text: "", kind: "none" };

  // Our own outbound DMs are echoed back on the same hook. Answering them
  // would put the bot in a conversation with itself.
  if (m.is_echo || m.is_deleted) return { text: "", kind: "echo" };

  const text = (m.text || "").trim();
  const attachment = m.attachments?.[0];

  if (text && m.reply_to?.story) return { text, kind: "story_reply" };
  if (text) return { text, kind: "text" };

  if (attachment?.type === "share" || attachment?.type === "ig_reel") {
    return { text: "", kind: "share" };
  }
  if (attachment) return { text: "", kind: attachment.type };
  return { text: "", kind: "none" };
}

/** `instagram:<channelId>:<igsid>` → the customer's scoped Instagram id. */
export function instagramRecipient(conversation) {
  const parts = (conversation?.external_session_id || "").split(":");
  return parts.length >= 3 ? parts[2] : null;
}

/** Who this account is, so the dashboard can show it back to them. */
export async function accountDetails({ token, igId, login }) {
  const res = await fetch(
    `${hostFor(login)}/${igId}?fields=username,name,profile_picture_url`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `Instagram returned ${res.status}`);
  return json;
}
