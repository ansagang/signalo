// hooks/useKnowledge.js
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getKnowledgeEntries,
  createKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
} from "@/actions/api";

// Fetch all entries — cached for 5 min
export function useKnowledgeEntries(filters) {    
  return useQuery({
    queryKey: ["knowledge-entries", filters],
    queryFn: () => getKnowledgeEntries(filters),
    // placeholderData: (prev) => prev,
  });
}

// Create
export function useCreateEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createKnowledgeEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-entries"] });
    }
  });
}

// Update
export function useUpdateEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }) => updateKnowledgeEntry(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["knowledge-entries"] });

      const previous = queryClient.getQueriesData({ queryKey: ["knowledge-entries"] });

      queryClient.setQueriesData({ queryKey: ["knowledge-entries"] }, (old) =>
        Array.isArray(old)
          ? old
              .map((item) => (item.id === id ? { ...item, ...updates } : item))
              .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
          : old,
      );

      return { previous };
    },
    onError: (err, vars, context) => {      
      context?.previous?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-entries"] });
    },
  });
}

// Delete
export function useDeleteEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteKnowledgeEntry,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["knowledge-entries"] });

      // Snapshot all matching queries so we can roll back on error
      const previous = queryClient.getQueriesData({ queryKey: ["knowledge-entries"] });

      // Optimistically remove the entry from every cached filtered list
      queryClient.setQueriesData({ queryKey: ["knowledge-entries"] }, (old) =>
        Array.isArray(old) ? old.filter((item) => item.id !== id) : old,
      );

      return { previous };
    },
    onError: (err, vars, context) => {
      context?.previous?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-entries"] });
    },
  });
}