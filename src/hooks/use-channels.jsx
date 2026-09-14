import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  rotatePublicKey,
  connectTelegram,
} from "@/actions/channels";

export function useChannels() {
  return useQuery({ queryKey: ["channels"], queryFn: getChannels });
}

function invalidating(mutationFn) {
  return function useIt() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn,
      onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
    });
  };
}

export const useCreateChannel = invalidating(createChannel);
export const useDeleteChannel = invalidating(deleteChannel);
export const useRotateKey = invalidating(rotatePublicKey);
export const useConnectTelegram = invalidating(connectTelegram);

export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }) => updateChannel(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
  });
}
