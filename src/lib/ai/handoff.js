/**
 * Whether a human still owns this conversation.
 *
 * A handoff used to be permanent, which on Telegram and WhatsApp means one
 * conversation per customer for life: escalate once and the assistant never
 * speaks to that person again. Businesses have regulars, so that is wrong.
 *
 * The rule is "stay out of the way while a person is working, come back when
 * they have stopped". As long as an agent keeps replying the assistant stays
 * quiet; once the humans have gone quiet for a while, the next customer
 * message is treated as a fresh start.
 */

/** How long the assistant waits after the last human involvement. */
export const HANDOFF_QUIET_MS = 6 * 60 * 60 * 1000;   // 6 hours

/** An agent marking it done is an immediate, explicit release. */
const DONE = ["resolved", "closed"];

/**
 * Decide whether the assistant should answer.
 *
 * Returns { reply, release }. `release` means the handoff has run its course
 * and the caller should clear it, so the dashboard stops showing the
 * conversation as waiting on a person.
 */
export async function handoffState(supabase, conversation, now = new Date()) {
  if (!conversation?.handoff) return { reply: true, release: false };

  if (DONE.includes(conversation.status)) {
    return { reply: true, release: true, why: "resolved" };
  }

  // The clock runs from the last thing a human did, not from the escalation,
  // so an agent working the conversation keeps the assistant out.
  let since = conversation.handoff_at ? new Date(conversation.handoff_at) : null;

  const { data: lastAgent } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversation.id)
    .eq("role", "agent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastAgent?.created_at) {
    const at = new Date(lastAgent.created_at);
    if (!since || at > since) since = at;
  }

  // No timestamp at all means an escalation from before this was recorded;
  // treat it as long past rather than silencing the customer indefinitely.
  if (!since) return { reply: true, release: true, why: "no_timestamp" };

  if (now.getTime() - since.getTime() >= HANDOFF_QUIET_MS) {
    return { reply: true, release: true, why: "quiet" };
  }

  return { reply: false, release: false, why: "agent_active" };
}

/** Hand the conversation back to the assistant. */
export async function releaseHandoff(supabase, conversationId) {
  await supabase
    .from("conversations")
    .update({ handoff: false, handoff_at: null, status: "open" })
    .eq("id", conversationId);
}
