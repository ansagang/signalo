import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
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
    staleTime: 30_000,
    // Hold the previous day on screen while the next one loads, so moving
    // through the week does not blank and reflow the whole timetable.
    placeholderData: keepPreviousData,
    // Background polling re-rendered the grid every 30s for no visible gain.
    refetchOnWindowFocus: true,
  });
}

export function useAvailability({ serviceId, date, staffId }) {
  return useQuery({
    queryKey: ["availability", serviceId, date, staffId],
    queryFn: () => getAvailability({ serviceId, date, staffId }),
    enabled: Boolean(serviceId && date),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
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
