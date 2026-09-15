/**
 * Catalogue data access.
 *
 * Every query against products, services, resource and opening hours lives here.
 * Functions take a Supabase client as their first argument so the same code
 * serves a server action (acting as the signed-in user) and any server-side
 * caller holding a service-role client — without duplicating the query.
 *
 * Nothing here checks permissions: callers pass an already-scoped client and
 * the userId they resolved. RLS is the backstop.
 */

import { generateEmbedding } from "@/lib/ai/embeddings";

/** The embedding is a 1536-float array — never ship it to the browser. */
const strip = (row) => {
  if (!row) return row;
  const { embedding, ...rest } = row;
  return rest;
};
const stripAll = (rows) => (rows || []).map(strip);

/* ─────────────────────────────── products ────────────────────────────── */

export function productText(p) {
  return [
    p.name,
    p.description,
    p.category ? `Category: ${p.category}` : null,
    p.price ? `Price: ${p.price} ${String(p.currency || "kzt").toUpperCase()}` : null,
  ]
    .filter(Boolean)
    .join(" — ");
}

export async function listProducts(supabase, userId, filters = {}) {
  let query = supabase
    .from("products")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  }
  if (filters.active !== undefined) query = query.eq("active", filters.active);

  const { data, error } = await query;
  if (error) throw error;
  return stripAll(data);
}

export async function createProduct(supabase, userId, product) {
  const embedding = await generateEmbedding(productText(product));
  const { data, error } = await supabase
    .from("products")
    .insert({ ...product, user_id: userId, embedding })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function updateProduct(supabase, userId, id, updates) {
  const { data: existing } = await supabase
    .from("products")
    .select("name, description, category, price, currency")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!existing) throw new Error("Product not found");

  const patch = { ...updates };
  // Only pay for a new embedding when the text the model reads changed.
  const textChanged = ["name", "description", "category", "price", "currency"].some(
    (k) => updates[k] !== undefined && updates[k] !== existing[k],
  );
  if (textChanged) patch.embedding = await generateEmbedding(productText({ ...existing, ...updates }));

  const { error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function deleteProduct(supabase, userId, id) {
  const { error } = await supabase.from("products").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function adjustStock(supabase, userId, { productId, delta, reason = "restock", note }) {
  const { data: product } = await supabase
    .from("products")
    .select("stock")
    .eq("id", productId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!product) throw new Error("Product not found");

  const next = Math.max(0, product.stock + Number(delta));
  const { error } = await supabase
    .from("products")
    .update({ stock: next })
    .eq("id", productId)
    .eq("user_id", userId);
  if (error) throw error;

  // Every movement is recorded, so the shelf and the ledger never disagree.
  await supabase.from("stock_movements").insert({
    user_id: userId,
    product_id: productId,
    delta: Number(delta),
    reason,
    note: note || null,
  });

  return next;
}

export async function listStockMovements(supabase, userId, productId) {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

/* ─────────────────────────────── services ────────────────────────────── */

export function serviceText(s) {
  return [
    s.name,
    s.description,
    s.category ? `Category: ${s.category}` : null,
    `${s.duration_min} minutes`,
    s.price ? `Price: ${s.price} ${String(s.currency || "kzt").toUpperCase()}` : null,
  ]
    .filter(Boolean)
    .join(" — ");
}

export async function listServices(supabase, userId, filters = {}) {
  let query = supabase
    .from("services")
    .select("*")
    .eq("user_id", userId)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return stripAll(data);
}

export async function createService(supabase, userId, service) {
  const embedding = await generateEmbedding(serviceText(service));
  const { data, error } = await supabase
    .from("services")
    .insert({ ...service, user_id: userId, embedding })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function updateService(supabase, userId, id, updates) {
  const { data: existing } = await supabase
    .from("services")
    .select("name, description, category, price, currency, duration_min")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!existing) throw new Error("Service not found");

  const patch = { ...updates };
  const textChanged = ["name", "description", "category", "price", "currency", "duration_min"].some(
    (k) => updates[k] !== undefined && updates[k] !== existing[k],
  );
  if (textChanged) patch.embedding = await generateEmbedding(serviceText({ ...existing, ...updates }));

  const { error } = await supabase
    .from("services")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function deleteService(supabase, userId, id) {
  const { error } = await supabase.from("services").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

/* ──────────────────── which masters do which service ─────────────────── */

export async function getServiceResourceMap(supabase, userId) {
  const { data, error } = await supabase
    .from("service_resources")
    .select("service_id, resource_id, services!inner(user_id)")
    .eq("services.user_id", userId);
  if (error) throw error;

  const map = {};
  for (const row of data || []) (map[row.service_id] ||= []).push(row.resource_id);
  return map;
}

export async function setServiceResources(supabase, userId, serviceId, resourceIds) {
  const { data: owned } = await supabase
    .from("services")
    .select("id")
    .eq("id", serviceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!owned) throw new Error("Service not found");

  const { error: delError } = await supabase
    .from("service_resources")
    .delete()
    .eq("service_id", serviceId);
  if (delError) throw delError;

  if (resourceIds?.length) {
    const { error } = await supabase
      .from("service_resources")
      .insert(resourceIds.map((resource_id) => ({ service_id: serviceId, resource_id })));
    if (error) throw error;
  }
}

/**
 * The same link, written from the resource's side.
 *
 * Assignment is one relation but two mental models — "what can serve this"
 * when editing a service, "what can this resource be used for" when editing
 * the resource. Both need to work.
 */
export async function setResourceServices(supabase, userId, resourceId, serviceIds) {
  const { data: owned } = await supabase
    .from("resources")
    .select("id")
    .eq("id", resourceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!owned) throw new Error("Resource not found");

  // Only touch rows for services this account owns.
  const { data: mine } = await supabase.from("services").select("id").eq("user_id", userId);
  const ownedIds = new Set((mine || []).map((r) => r.id));

  const { error: delError } = await supabase
    .from("service_resources")
    .delete()
    .eq("resource_id", resourceId)
    .in("service_id", [...ownedIds]);
  if (delError) throw delError;

  const wanted = (serviceIds || []).filter((id) => ownedIds.has(id));
  if (wanted.length) {
    const { error } = await supabase
      .from("service_resources")
      .insert(wanted.map((service_id) => ({ service_id, resource_id: resourceId })));
    if (error) throw error;
  }
}

/* ──────────────────────── resources & their hours ────────────────────── */

export async function listResources(supabase, userId) {
  const { data, error } = await supabase
    .from("resources")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createResource(supabase, userId, member) {
  const { data, error } = await supabase
    .from("resources")
    .insert({ ...member, user_id: userId })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function updateResource(supabase, userId, id, updates) {
  const { error } = await supabase.from("resources").update(updates).eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function deleteResource(supabase, userId, id) {
  const { error } = await supabase.from("resources").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

/** Always seven rows, so the editor has a full week whether or not it is set. */
function fillWeek(rows, shape) {
  const byDay = new Map((rows || []).map((d) => [d.weekday, d]));
  return Array.from({ length: 7 }, (_, wd) => byDay.get(wd) || shape(wd));
}

export async function listBusinessHours(supabase, userId) {
  const { data, error } = await supabase
    .from("business_hours")
    .select("*")
    .eq("user_id", userId)
    .order("weekday", { ascending: true });
  if (error) throw error;

  return fillWeek(data, (wd) => ({
    weekday: wd, opens: "09:00", closes: "18:00", closed: wd === 0, user_id: userId,
  }));
}

export async function saveBusinessHours(supabase, userId, rows) {
  const payload = rows.map((r) => ({
    user_id: userId,
    weekday: r.weekday,
    opens: r.opens,
    closes: r.closes,
    closed: Boolean(r.closed),
  }));
  const { error } = await supabase
    .from("business_hours")
    .upsert(payload, { onConflict: "user_id,weekday" });
  if (error) throw error;
}

export async function listResourceHours(supabase, userId, resourceId) {
  const { data, error } = await supabase
    .from("resource_hours")
    .select("*")
    .eq("user_id", userId)
    .eq("resource_id", resourceId)
    .order("weekday", { ascending: true });
  if (error) throw error;

  return fillWeek(data, (wd) => ({
    weekday: wd, resource_id: resourceId, starts_at: "10:00", ends_at: "19:00", off: wd === 0,
  }));
}

export async function saveResourceHours(supabase, userId, resourceId, rows) {
  const { data: owned } = await supabase
    .from("resources")
    .select("id")
    .eq("id", resourceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!owned) throw new Error("Resource not found");

  const payload = rows.map((r) => ({
    user_id: userId,
    resource_id: resourceId,
    weekday: r.weekday,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    off: Boolean(r.off),
  }));
  const { error } = await supabase
    .from("resource_hours")
    .upsert(payload, { onConflict: "resource_id,weekday" });
  if (error) throw error;
}
