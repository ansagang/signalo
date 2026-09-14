"use server";

import { createClient } from "@/lib/supabase/server";

async function scoped() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function getAppointments({ from, to, status, staffId } = {}) {
  const { supabase, user } = await scoped();
  if (!user) return [];

  let query = supabase
    .from("appointments")
    .select("*, services(name, category, duration_min), staff(name, icon)")
    .eq("user_id", user.id)
    .order("starts_at", { ascending: true });

  if (from) query = query.gte("starts_at", from);
  if (to) query = query.lt("starts_at", to);
  if (status) query = query.eq("status", status);
  if (staffId) query = query.eq("staff_id", staffId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function updateAppointment(id, updates) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const patch = {};
  for (const key of ["status", "note", "staff_id", "customer_name", "customer_contact"]) {
    if (updates[key] !== undefined) patch[key] = updates[key];
  }

  const { error } = await supabase
    .from("appointments")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, message: error.message };
  return { success: true };
}

/** Free start times for a service on one day, as the bot would see them. */
export async function getAvailability({ serviceId, date, staffId, timezone = "Asia/Almaty" }) {
  const { supabase, user } = await scoped();
  if (!user || !serviceId || !date) return [];

  const { data, error } = await supabase.rpc("available_slots", {
    p_user_id: user.id,
    p_service_id: serviceId,
    p_day: date,
    p_staff_id: staffId || null,
    p_timezone: timezone,
  });

  if (error) throw error;
  return data || [];
}

/** Manual booking from the dashboard — same atomic path the bot uses. */
export async function createAppointment({
  serviceId,
  startsAt,
  staffId,
  customerName,
  customerContact,
  note,
}) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const { data, error } = await supabase.rpc("book_appointment", {
    p_user_id: user.id,
    p_service_id: serviceId,
    p_starts_at: startsAt,
    p_staff_id: staffId || null,
    p_conversation_id: null,
    p_customer_name: customerName || null,
    p_customer_contact: customerContact || null,
    p_note: note || null,
    p_timezone: "Asia/Almaty",
  });

  if (error) {
    if ((error.message || "").includes("slot_taken")) {
      return { success: false, message: "That time is not bookable — taken, or not one of the shop's start times." };
    }
    return { success: false, message: error.message };
  }

  return { success: true, data: Array.isArray(data) ? data[0] : data };
}

export async function cancelOrderWithRestock(orderId) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const { error } = await supabase.rpc("cancel_order", {
    p_user_id: user.id,
    p_order_id: orderId,
  });

  if (error) return { success: false, message: error.message };
  return { success: true };
}
