"use server";

import { action, query } from "@/lib/session";
import * as bookings from "@/lib/services/bookings";

export async function getAppointments(range) {
  return query((db, user) => bookings.listAppointments(db, user.id, range), []);
}

export async function updateAppointment(id, updates) {
  return action((db, user) => bookings.updateAppointment(db, user.id, id, updates));
}

export async function getAvailability({ serviceId, date, resourceId, timezone, party } = {}) {
  if (!serviceId || !date) return [];
  return query(
    (db, user) => bookings.availableSlots(db, user.id, { serviceId, date, resourceId, timezone, party }),
    [],
  );
}

/** Manual booking from the dashboard — the same atomic path the bot uses. */
export async function createAppointment(input) {
  return action((db, user) => bookings.bookAppointment(db, user.id, input));
}

export async function cancelOrderWithRestock(orderId) {
  return action((db, user) => bookings.cancelOrder(db, user.id, orderId));
}
