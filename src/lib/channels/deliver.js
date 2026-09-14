/**
 * Outbound delivery to whichever channel a conversation came in on.
 *
 * Writing a row into `messages` only records that a reply happened — it does
 * not put the text in front of the customer. Anything an agent or the bot
 * says on an external channel has to be pushed back out through that
 * channel's API, which is what this does.
 */

/** `telegram:<channelId>:<chatId>` → chatId */
export function telegramChatId(conversation) {
  const parts = (conversation?.external_session_id || "").split(":");
  return parts.length >= 3 ? parts[2] : null;
}

async function sendTelegram({ token, chatId, text }) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) {
    return { ok: false, error: body.description || `Telegram returned ${res.status}` };
  }
  return { ok: true, messageId: body.result?.message_id };
}

/**
 * Push `text` to the customer on their own channel.
 *
 * `supabase` must be able to read channels.secrets, so this has to run with
 * the service role — never from the browser.
 *
 * Returns { ok, delivered, error }. `delivered:false` with `ok:true` means the
 * channel needs no push (the web widget reads from the database itself).
 */
export async function deliverToCustomer({ supabase, conversation, text }) {
  if (!text?.trim()) return { ok: false, error: "Nothing to send." };

  if (conversation.channel === "telegram") {
    if (!conversation.channel_id) {
      return { ok: false, error: "This conversation is not linked to a channel." };
    }

    const { data: channel } = await supabase
      .from("channels")
      .select("secrets, is_active")
      .eq("id", conversation.channel_id)
      .maybeSingle();

    const token = channel?.secrets?.bot_token;
    if (!token) return { ok: false, error: "The Telegram bot token is missing." };

    const chatId = telegramChatId(conversation);
    if (!chatId) return { ok: false, error: "Could not work out the Telegram chat." };

    const sent = await sendTelegram({ token, chatId, text });
    return sent.ok
      ? { ok: true, delivered: true, messageId: sent.messageId }
      : { ok: false, error: sent.error };
  }

  // webchat / playground: the widget polls the transcript, so the row itself
  // is the delivery mechanism.
  return { ok: true, delivered: false };
}
