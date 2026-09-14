// hooks/useKnowledge.js
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    getPersonas,
    getPersona,
    createPersona,
    updatePersona,
    deletePersona
} from "@/actions/api";

// Fetch all entries — cached for 5 min
export function usePersonas() {
    return useQuery({
        queryKey: ["personas"],
        queryFn: () => getPersonas(),
        // placeholderData: (prev) => prev,
    });
}

export function usePersona(id) {
    return useQuery({
        queryKey: ["persona", id],
        queryFn: () => getPersona(id),
        // placeholderData: (prev) => prev,
    });
}

// Create
export function useCreatePersona() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createPersona,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["personas"] });
        }
    });
}

// Update
export function useUpdatePersona() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, updates }) => updatePersona(id, updates),
        onMutate: async ({ id, updates }) => {
            await queryClient.cancelQueries({ queryKey: ["personas"] });

            const previous = queryClient.getQueriesData({ queryKey: ["personas"] });

            queryClient.setQueriesData({ queryKey: ["personas"] }, (old) =>
                old?.map((item) => (item.id === id ? { ...item, ...updates } : item))
            );

            return { previous };
        },
        onError: (err, vars, context) => {
            context?.previous?.forEach(([key, data]) => {
                queryClient.setQueryData(key, data);
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["personas"] });
        },
    });
}

// Delete
export function useDeletePersona() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deletePersona,
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: ["personas"] });

            // Snapshot all matching queries so we can roll back on error
            const previous = queryClient.getQueriesData({ queryKey: ["personas"] });

            // Optimistically remove the entry from every cached filtered list
            queryClient.setQueriesData({ queryKey: ["personas"] }, (old) =>
                old?.filter((item) => item.id !== id)
            );

            return { previous };
        },
        onError: (err, vars, context) => {
            context?.previous?.forEach(([key, data]) => {
                queryClient.setQueryData(key, data);
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["personas"] });
        },
    });
}