import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getConversations,
  getMessages,
  sendAgentMessage,
  updateConversation,
  getOrders,
  updateOrderStatus,
} from "@/actions/inbox";

export function useConversations(filters) {
  return useQuery({
    queryKey: ["conversations", filters],
    queryFn: () => getConversations(filters),
    // The inbox is a live surface — keep it fresher than the 5 min default.
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useMessages(conversationId) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => getMessages(conversationId),
    enabled: Boolean(conversationId),
    staleTime: 5_000,
    refetchInterval: conversationId ? 8_000 : false,
  });
}

export function useOrders(filters) {
  return useQuery({
    queryKey: ["orders", filters],
    queryFn: () => getOrders(filters),
    staleTime: 30_000,
  });
}

export function useSendAgentMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sendAgentMessage,
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useUpdateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }) => updateConversation(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => updateOrderStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}
