"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { deliverToCustomer } from "@/lib/channels/deliver";

async function scoped() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function getConversations(filters = {}) {
  const { supabase, user } = await scoped();
  if (!user) return [];

  const { status, channel, search, handoff } = filters;

  let query = supabase
    .from("conversations")
    .select("*, personas(name, icon)")
    .eq("user_id", user.id)
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

export async function getConversation(id) {
  const { supabase, user } = await scoped();
  if (!user || !id) return null;

  const { data, error } = await supabase
    .from("conversations")
    .select("*, personas(id, name, icon, tone)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getMessages(conversationId) {
  const { supabase, user } = await scoped();
  if (!user || !conversationId) return [];

  // Ownership is checked on the parent conversation; messages carry no user_id.
  const { data: convo } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!convo) return [];

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

/** A human operator replying inside a conversation the bot was handling. */
export async function sendAgentMessage({ conversationId, content }) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };
  if (!content?.trim()) return { success: false, message: "Message is empty" };

  const { data: convo } = await supabase
    .from("conversations")
    .select("id, channel, channel_id, external_session_id")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!convo) return { success: false, message: "Conversation not found" };

  const text = content.trim();

  // Push to the customer FIRST. Recording a reply we could not deliver would
  // show the agent a sent message the customer never receives.
  // channels.secrets is readable only with the service role.
  const delivery = await deliverToCustomer({
    supabase: createServiceClient(),
    conversation: convo,
    text,
  });

  if (!delivery.ok) {
    return { success: false, message: delivery.error || "Could not deliver the message." };
  }

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "agent",
    content: text,
    channel: convo.channel,
    channel_msg_id: delivery.messageId ? String(delivery.messageId) : null,
  });
  if (error) return { success: false, message: error.message };

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), assigned_agent: user.id })
    .eq("id", conversationId);

  return { success: true, delivered: delivery.delivered };
}

export async function updateConversation(id, updates) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const allowed = {};
  for (const key of ["status", "handoff", "classification", "customer_name"]) {
    if (updates[key] !== undefined) allowed[key] = updates[key];
  }
  if (allowed.status === "resolved") allowed.resolved_at = new Date().toISOString();

  const { error } = await supabase
    .from("conversations")
    .update(allowed)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, message: error.message };
  return { success: true };
}

/* ───────────────────────────── orders ───────────────────────────── */

export async function getOrders(filters = {}) {
  const { supabase, user } = await scoped();
  if (!user) return [];

  let query = supabase
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.conversationId) query = query.eq("conversation_id", filters.conversationId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function updateOrderStatus(id, status) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, message: error.message };
  return { success: true };
}
