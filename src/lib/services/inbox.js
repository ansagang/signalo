/**
 * Conversations, messages and orders.
 *
 * Messages carry no user_id of their own, so ownership is always checked on
 * the parent conversation before they are read or written.
 */

export async function listConversations(supabase, userId, filters = {}) {
  const { status, channel, search, handoff } = filters;

  let query = supabase
    .from("conversations")
    .select("*, personas(name, icon)")
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);
  if (channel) query = query.eq("channel", channel);
  if (handoff) query = query.eq("handoff", true);
  if (search) {
    query = query.or(
      `customer_name.ilike.%${search}%,customer_identifier.ilike.%${search}%,phone.ilike.%${search}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getConversation(supabase, userId, id) {
  const { data, error } = await supabase
    .from("conversations")
    .select("*, personas(id, name, icon, tone)")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listMessages(supabase, userId, conversationId) {
  const owned = await getConversationOwned(supabase, userId, conversationId);
  if (!owned) return [];

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

/** Ownership probe used before anything touches a conversation's messages. */
export async function getConversationOwned(supabase, userId, conversationId) {
  const { data } = await supabase
    .from("conversations")
    .select("id, channel, channel_id, external_session_id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function insertAgentMessage(supabase, { conversationId, content, channel, channelMsgId }) {
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "agent",
    content,
    channel,
    channel_msg_id: channelMsgId ? String(channelMsgId) : null,
  });
  if (error) throw error;
}

export async function touchConversation(supabase, conversationId, patch = {}) {
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), ...patch })
    .eq("id", conversationId);
}

export async function updateConversation(supabase, userId, id, updates) {
  const allowed = {};
  for (const key of ["status", "handoff", "handoff_at", "classification", "customer_name"]) {
    if (updates[key] !== undefined) allowed[key] = updates[key];
  }
  if (allowed.status === "resolved") allowed.resolved_at = new Date().toISOString();

  const { error } = await supabase
    .from("conversations")
    .update(allowed)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

/* ──────────────────────────────── orders ─────────────────────────────── */

export async function listOrders(supabase, userId, filters = {}) {
  let query = supabase
    .from("orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.conversationId) query = query.eq("conversation_id", filters.conversationId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function updateOrderStatus(supabase, userId, id, status) {
  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}
