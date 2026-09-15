/**
 * Appointments and availability.
 *
 * Slot generation and booking both go through database functions, so the
 * assistant and the dashboard cannot disagree about what is free.
 */

const TZ = "Asia/Almaty";

export async function listAppointments(supabase, userId, { from, to, status, staffId } = {}) {
  let query = supabase
    .from("appointments")
    .select("*, services(name, category, duration_min), staff(name, icon)")
    .eq("user_id", userId)
    .order("starts_at", { ascending: true });

  if (from) query = query.gte("starts_at", from);
  if (to) query = query.lt("starts_at", to);
  if (status) query = query.eq("status", status);
  if (staffId) query = query.eq("staff_id", staffId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function updateAppointment(supabase, userId, id, updates) {
  const patch = {};
  for (const key of ["status", "note", "staff_id", "customer_name", "customer_contact"]) {
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
export async function availableSlots(
  supabase,
  userId,
  { serviceId, date, staffId, timezone = TZ },
) {
  const { data, error } = await supabase.rpc("available_slots", {
    p_user_id: userId,
    p_service_id: serviceId,
    p_day: date,
    p_staff_id: staffId || null,
    p_timezone: timezone,
  });
  if (error) throw error;
  return data || [];
}

export async function bookAppointment(
  supabase,
  userId,
  { serviceId, startsAt, staffId, conversationId, customerName, customerContact, note, timezone = TZ },
) {
  const { data, error } = await supabase.rpc("book_appointment", {
    p_user_id: userId,
    p_service_id: serviceId,
    p_starts_at: startsAt,
    p_staff_id: staffId || null,
    p_conversation_id: conversationId || null,
    p_customer_name: customerName || null,
    p_customer_contact: customerContact || null,
    p_note: note || null,
    p_timezone: timezone,
  });

  if (error) {
    // The database speaks in codes; turn them into something a person reads.
    if ((error.message || "").includes("slot_taken")) {
      const err = new Error("That time is not bookable — taken, or not one of the shop's start times.");
      err.code = "slot_taken";
      throw err;
    }
    if ((error.message || "").includes("service_not_found")) {
      const err = new Error("That service does not exist.");
      err.code = "service_not_found";
      throw err;
    }
    throw error;
  }

  return Array.isArray(data) ? data[0] : data;
}

export async function cancelOrder(supabase, userId, orderId) {
  const { error } = await supabase.rpc("cancel_order", {
    p_user_id: userId,
    p_order_id: orderId,
  });
  if (error) throw error;
}
