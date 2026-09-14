"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Dashboard overview numbers. One round trip per metric, all scoped to the
 * signed-in user (the service-role client bypasses RLS).
 */
export async function getOverviewStats() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceIso = since.toISOString();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    conversations,
    recentConversations,
    handoffs,
    orders,
    entries,
    personas,
    channels,
    recent,
    appointments,
    todayBookings,
    products,
    services,
  ] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", sinceIso),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("handoff", true),
    supabase.from("orders").select("total, currency, status, created_at").eq("user_id", user.id),
    supabase
      .from("knowledge_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("active", true),
    supabase.from("personas").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase
      .from("channels")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true),
    supabase
      .from("conversations")
      .select("id, customer_name, customer_identifier, channel, status, handoff, last_message_at")
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false })
      .limit(6),
    supabase
      .from("appointments")
      .select("price, currency, status, created_at, starts_at")
      .eq("user_id", user.id),
    supabase
      .from("appointments")
      .select("id, starts_at, ends_at, customer_name, status, services(name)")
      .eq("user_id", user.id)
      .gte("starts_at", todayStart.toISOString())
      .lt("starts_at", new Date(todayStart.getTime() + 864e5).toISOString())
      .not("status", "eq", "cancelled")
      .order("starts_at", { ascending: true })
      .limit(6),
    supabase
      .from("products")
      .select("id, name, stock, low_stock_at, track_stock, active")
      .eq("user_id", user.id)
      .eq("active", true),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("active", true),
  ]);

  const allOrders = orders.data || [];
  const orderRevenue = allOrders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + Number(o.total || 0), 0);
  const ordersLast30 = allOrders.filter((o) => o.created_at >= sinceIso).length;

  const allAppointments = appointments.data || [];
  const bookingRevenue = allAppointments
    .filter((a) => a.status !== "cancelled" && a.status !== "no_show")
    .reduce((sum, a) => sum + Number(a.price || 0), 0);
  const bookingsLast30 = allAppointments.filter((a) => a.created_at >= sinceIso).length;

  const allProducts = products.data || [];
  const lowStock = allProducts.filter(
    (p) => p.track_stock && p.stock <= p.low_stock_at,
  );

  const totalConversations = conversations.count || 0;
  const handoffCount = handoffs.count || 0;

  return {
    conversations: totalConversations,
    conversationsLast30: recentConversations.count || 0,
    handoffs: handoffCount,
    // Share of conversations the bot finished without asking for a human.
    autoResolveRate:
      totalConversations > 0
        ? Math.round(((totalConversations - handoffCount) / totalConversations) * 100)
        : null,
    orders: allOrders.length,
    ordersLast30,
    bookings: allAppointments.length,
    bookingsLast30,
    // One number the owner actually cares about: goods sold plus time sold.
    revenue: orderRevenue + bookingRevenue,
    orderRevenue,
    bookingRevenue,
    currency: allOrders[0]?.currency || allAppointments[0]?.currency || "kzt",
    entries: entries.count || 0,
    personas: personas.count || 0,
    channels: channels.count || 0,
    products: allProducts.length,
    services: services.count || 0,
    lowStock,
    todayBookings: todayBookings.data || [],
    recent: recent.data || [],
  };
}
