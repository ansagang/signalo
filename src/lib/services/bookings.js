/**
 * Appointments and availability.
 *
 * Slot generation and booking both go through database functions, so the
 * assistant and the dashboard cannot disagree about what is free.
 */

import { DEFAULT_TZ } from "@/lib/timezone";
import { freeSlots, checkSlot, atLocal, localDay } from "@/lib/booking/schedule";

export async function listAppointments(supabase, userId, { from, to, status, resourceId } = {}) {
  let query = supabase
    .from("appointments")
    .select("*, services(name, category, duration_min, booking_mode), resources(name, icon, kind, capacity)")
    .eq("user_id", userId)
    .order("starts_at", { ascending: true });

  if (from) query = query.gte("starts_at", from);
  if (to) query = query.lt("starts_at", to);
  if (status) query = query.eq("status", status);
  if (resourceId) query = query.eq("resource_id", resourceId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function updateAppointment(supabase, userId, id, updates) {
  const patch = {};
  for (const key of ["status", "note", "resource_id", "customer_name", "customer_contact", "party_size"]) {
    if (updates[key] !== undefined) patch[key] = updates[key];
  }
  const { error } = await supabase
    .from("appointments")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Free start times, exactly as the assistant sees them. */
/**
 * Remove a booking from the calendar for good.
 *
 * A finished or cancelled booking already stops holding its slot — only
 * 'booked' and 'confirmed' count against availability — so this is about
 * clearing the view, not freeing capacity.
 */
export async function deleteAppointment(supabase, userId, id) {
  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

/**
 * Everything the scheduler needs for one day, in one round trip each.
 *
 * Loaded here and handed to pure functions, so the rules themselves stay
 * testable without a database.
 */
async function loadDay(supabase, userId, { serviceId, date, timezone }) {
  const { data: service, error } = await supabase
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!service) return null;

  const from = atLocal(date, "00:00", timezone);
  const to = new Date(from.getTime() + 36 * 3600_000);   // room for a long booking

  const [{ data: businessHours }, { data: links }, { data: appointments }] = await Promise.all([
    supabase.from("business_hours").select("weekday, opens, closes, closed").eq("user_id", userId),
    supabase.from("service_resources").select("resource_id").eq("service_id", serviceId),
    supabase
      .from("appointments")
      .select("id, starts_at, ends_at, status, party_size, resource_id, service_id")
      .eq("user_id", userId)
      .gte("starts_at", new Date(from.getTime() - 24 * 3600_000).toISOString())
      .lt("starts_at", to.toISOString()),
  ]);

  const ids = (links || []).map((l) => l.resource_id);
  let resources = [];
  let resourceHours = [];

  if (ids.length) {
    const [{ data: people }, { data: hours }] = await Promise.all([
      supabase.from("resources").select("id, name, active").in("id", ids),
      supabase.from("resource_hours").select("resource_id, weekday, starts_at, ends_at, off").in("resource_id", ids),
    ]);
    resources = people || [];
    resourceHours = hours || [];
  }

  return {
    service, day: date, timezone,
    businessHours: businessHours || [],
    resources, resourceHours,
    appointments: appointments || [],
  };
}

export async function availableSlots(
  supabase,
  userId,
  { serviceId, date, resourceId, timezone = DEFAULT_TZ, party = 1 },
) {
  const day = await loadDay(supabase, userId, { serviceId, date, timezone });
  if (!day) return [];
  return freeSlots({ ...day, resourceId: resourceId || null, party });
}

/** Whether one exact time can be booked, and why not when it cannot. */
export async function slotCheck(
  supabase,
  userId,
  { serviceId, startsAt, resourceId, timezone = DEFAULT_TZ, party = 1, excludeId = null },
) {
  const date = localDay(startsAt, timezone);
  const day = await loadDay(supabase, userId, { serviceId, date, timezone });
  if (!day) return { ok: false, reason: "service_not_found" };
  return checkSlot({ ...day, resourceId: resourceId || null, startsAt, party, excludeId });
}

export async function bookAppointment(
  supabase,
  userId,
  { serviceId, startsAt, resourceId, conversationId, customerName, customerContact, note, timezone = DEFAULT_TZ, party = 1 },
) {
  // Decide in code, then let the database do the one thing code cannot: look
  // and write without anyone slipping in between.
  const verdict = await slotCheck(supabase, userId, { serviceId, startsAt, resourceId, timezone, party });

  if (!verdict.ok) {
    const err = new Error(
      verdict.reason === "party_out_of_range"
        ? `This takes between ${verdict.min} and ${verdict.max} people.`
        : "That time is not bookable.",
    );
    err.code = verdict.reason === "party_out_of_range" ? "party_out_of_range" : "slot_taken";
    err.reason = verdict.reason;
    if (verdict.min !== undefined) { err.min = verdict.min; err.max = verdict.max; }
    throw err;
  }

  const { data, error } = await supabase.rpc("write_appointment", {
    p_user_id: userId,
    p_service_id: serviceId,
    p_starts_at: new Date(startsAt).toISOString(),
    p_resource_id: verdict.resourceId || null,
    p_party: party,
    p_conversation_id: conversationId || null,
    p_customer_name: customerName || null,
    p_customer_contact: customerContact || null,
    p_note: note || null,
  });

  if (error) {
    const message = error.message || "";
    // Lost the race between the check above and the write.
    if (message.includes("slot_taken")) {
      const err = new Error("That time was taken while we were booking it.");
      err.code = "slot_taken";
      err.reason = message.split("slot_taken:")[1]?.split(/[^a-z_]/)[0] || "all_busy";
      throw err;
    }
    if (message.includes("party_out_of_range")) {
      const [, min, max] = message.split(":");
      const err = new Error(`This takes between ${min} and ${max} people.`);
      err.code = "party_out_of_range";
      err.min = min; err.max = max;
      throw err;
    }
    throw error;
  }

  return data;
}

/**
 * A customer's own upcoming bookings.
 *
 * Ownership is deliberately narrow. On Telegram, WhatsApp and email the
 * transport proves who is writing, so their address is enough. On the web
 * widget the session id proves nothing — a stranger could name someone else's
 * phone number — so there we only ever reach bookings made in this very
 * conversation.
 */
export async function customerAppointments(
  supabase,
  userId,
  { conversationId, identifier, channel },
) {
  const verified = ["telegram", "whatsapp", "email"].includes(channel);

  let query = supabase
    .from("appointments")
    .select("id, starts_at, ends_at, status, party_size, service_id, resource_id, customer_name, customer_contact, services(name), resources(name)")
    .eq("user_id", userId)
    .in("status", ["booked", "confirmed"])
    .gte("starts_at", new Date(Date.now() - 3600_000).toISOString())
    .order("starts_at", { ascending: true })
    .limit(20);

  query = verified && identifier
    ? query.or(`conversation_id.eq.${conversationId},customer_contact.eq.${identifier}`)
    : query.eq("conversation_id", conversationId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** One of this customer's bookings, by id — or null if it is not theirs. */
async function ownedAppointment(supabase, userId, appointmentId, scope) {
  const mine = await customerAppointments(supabase, userId, scope);
  return mine.find((a) => a.id === appointmentId) || null;
}

/**
 * Move a booking to another time.
 *
 * Checked in code against the new time, then moved atomically — excluding
 * itself, so a booking is never blocked by the slot it is leaving.
 */
export async function rescheduleAppointment(
  supabase,
  userId,
  { appointmentId, startsAt, resourceId, timezone = DEFAULT_TZ, party, scope },
) {
  const appt = await ownedAppointment(supabase, userId, appointmentId, scope);
  if (!appt) {
    const err = new Error("That booking is not one we can change here.");
    err.code = "not_yours";
    throw err;
  }

  const wanted = party || appt.party_size || 1;
  const verdict = await slotCheck(supabase, userId, {
    serviceId: appt.service_id,
    startsAt,
    resourceId: resourceId || null,
    timezone,
    party: wanted,
    excludeId: appointmentId,
  });

  if (!verdict.ok) {
    const err = new Error(
      verdict.reason === "party_out_of_range"
        ? `This takes between ${verdict.min} and ${verdict.max} people.`
        : "That time is not bookable.",
    );
    err.code = verdict.reason === "party_out_of_range" ? "party_out_of_range" : "slot_taken";
    err.reason = verdict.reason;
    if (verdict.min !== undefined) { err.min = verdict.min; err.max = verdict.max; }
    throw err;
  }

  // Same guard as a new booking; the id is what makes it a move.
  const { data, error } = await supabase.rpc("write_appointment", {
    p_user_id: userId,
    p_service_id: appt.service_id,
    p_starts_at: new Date(startsAt).toISOString(),
    p_resource_id: verdict.resourceId || null,
    p_party: wanted,
    p_appointment_id: appointmentId,
  });

  if (error) {
    const message = error.message || "";
    if (message.includes("slot_taken")) {
      const err = new Error("That time was taken while we were moving it.");
      err.code = "slot_taken";
      err.reason = message.split("slot_taken:")[1]?.split(/[^a-z_]/)[0] || "all_busy";
      throw err;
    }
    throw error;
  }

  return { appointment: data, from: appt.starts_at };
}

/**
 * Cancel a booking.
 *
 * Marked cancelled rather than deleted: the time is freed either way, because
 * availability only counts booked and confirmed, and the seller keeps a record
 * of what happened. Removing the row for good is a dashboard action.
 */
export async function cancelAppointment(
  supabase,
  userId,
  { appointmentId, reason, scope },
) {
  const appt = await ownedAppointment(supabase, userId, appointmentId, scope);
  if (!appt) {
    const err = new Error("That booking is not one we can change here.");
    err.code = "not_yours";
    throw err;
  }

  const note = reason?.trim()
    ? `Cancelled by the customer: ${reason.trim()}`
    : "Cancelled by the customer.";

  const { data, error } = await supabase
    .from("appointments")
    .update({ status: "cancelled", note })
    .eq("id", appointmentId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function cancelOrder(supabase, userId, orderId) {
  const { error } = await supabase.rpc("cancel_order", {
    p_user_id: userId,
    p_order_id: orderId,
  });
  if (error) throw error;
}
