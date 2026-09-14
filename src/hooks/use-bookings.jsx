import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAppointments,
  updateAppointment,
  createAppointment,
  getAvailability,
} from "@/actions/bookings";

export function useAppointments(range) {
  return useQuery({
    queryKey: ["appointments", range],
    queryFn: () => getAppointments(range),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useAvailability({ serviceId, date, staffId }) {
  return useQuery({
    queryKey: ["availability", serviceId, date, staffId],
    queryFn: () => getAvailability({ serviceId, date, staffId }),
    enabled: Boolean(serviceId && date),
  });
}

export function useUpdateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }) => updateAppointment(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAppointment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["availability"] });
    },
  });
}
