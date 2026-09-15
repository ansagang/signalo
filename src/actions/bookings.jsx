"use server";

import { action, query } from "@/lib/session";
import * as bookings from "@/lib/services/bookings";
import { tzForUser } from "@/lib/timezone";

export async function getAppointments(range) {
  return query((db, user) => bookings.listAppointments(db, user.id, range), []);
}

export async function updateAppointment(id, updates) {
  return action((db, user) => bookings.updateAppointment(db, user.id, id, updates));
}

export async function deleteAppointment(id) {
  return action((db, user) => bookings.deleteAppointment(db, user.id, id));
}

export async function getAvailability({ serviceId, date, resourceId, timezone, party } = {}) {
  if (!serviceId || !date) return [];
  return query(
    async (db, user) =>
      bookings.availableSlots(db, user.id, {
        serviceId, date, resourceId, party,
        timezone: timezone || (await tzForUser(db, user.id)),
      }),
    [],
  );
}

/** Manual booking from the dashboard — the same atomic path the bot uses. */
export async function createAppointment(input) {
  return action(async (db, user) =>
    bookings.bookAppointment(db, user.id, {
      ...input,
      timezone: input.timezone || (await tzForUser(db, user.id)),
    }),
  );
}

export async function cancelOrderWithRestock(orderId) {
  return action((db, user) => bookings.cancelOrder(db, user.id, orderId));
}
