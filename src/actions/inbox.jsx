"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { deliverToCustomer } from "@/lib/channels/deliver";
import { action, query } from "@/lib/session";
import * as inbox from "@/lib/services/inbox";

export async function getConversations(filters) {
  return query((db, user) => inbox.listConversations(db, user.id, filters), []);
}

export async function getConversation(id) {
  if (!id) return null;
  return query((db, user) => inbox.getConversation(db, user.id, id), null);
}

export async function getMessages(conversationId) {
  if (!conversationId) return [];
  return query((db, user) => inbox.listMessages(db, user.id, conversationId), []);
}

/** A human operator replying inside a conversation the bot was handling. */
export async function sendAgentMessage({ conversationId, content }) {
  return action(async (db, user) => {
    const text = (content || "").trim();
    if (!text) throw new Error("Message is empty");

    const convo = await inbox.getConversationOwned(db, user.id, conversationId);
    if (!convo) throw new Error("Conversation not found");

    // Deliver FIRST. Recording a reply we could not send would show the agent
    // a sent message the customer never receives.
    const delivery = await deliverToCustomer({
      supabase: createServiceClient(), // channels.secrets needs the service role
      conversation: convo,
      text,
    });
    if (!delivery.ok) throw new Error(delivery.error || "Could not deliver the message.");

    await inbox.insertAgentMessage(db, {
      conversationId,
      content: text,
      channel: convo.channel,
      channelMsgId: delivery.messageId,
    });
    await inbox.touchConversation(db, conversationId, { assigned_agent: user.id });

    return { delivered: delivery.delivered };
  });
}

export async function updateConversation(id, updates) {
  return action((db, user) => inbox.updateConversation(db, user.id, id, updates));
}

export async function getOrders(filters) {
  return query((db, user) => inbox.listOrders(db, user.id, filters), []);
}

export async function updateOrderStatus(id, status) {
  return action((db, user) => inbox.updateOrderStatus(db, user.id, id, status));
}
