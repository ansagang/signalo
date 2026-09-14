"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateEmbedding } from "@/lib/ai/embeddings";

async function scoped() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/* ─────────────────────────────── products ────────────────────────────── */

function productText(p) {
  return [
    p.name,
    p.description,
    p.category ? `Category: ${p.category}` : null,
    p.price ? `Price: ${p.price} ${String(p.currency || "kzt").toUpperCase()}` : null,
  ]
    .filter(Boolean)
    .join(" — ");
}

export async function getProducts(filters = {}) {
  const { supabase, user } = await scoped();
  if (!user) return [];

  let query = supabase
    .from("products")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  }
  if (filters.active !== undefined) query = query.eq("active", filters.active);

  const { data, error } = await query;
  if (error) throw error;
  // embedding is a 1536-float array — never ship it to the browser
  return (data || []).map(({ embedding, ...rest }) => rest);
}

export async function createProduct(product) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const embedding = await generateEmbedding(productText(product));
  const { data, error } = await supabase
    .from("products")
    .insert({ ...product, user_id: user.id, embedding })
    .select("id")
    .single();

  if (error) return { success: false, message: error.message };
  return { success: true, data };
}

export async function updateProduct(id, updates) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const { data: existing } = await supabase
    .from("products")
    .select("name, description, category, price, currency")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) return { success: false, message: "Product not found" };

  const patch = { ...updates };

  // Only re-embed when the text the model reads actually changed.
  const merged = { ...existing, ...updates };
  const textChanged = ["name", "description", "category", "price", "currency"].some(
    (k) => updates[k] !== undefined && updates[k] !== existing[k],
  );
  if (textChanged) patch.embedding = await generateEmbedding(productText(merged));

  const { error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function deleteProduct(id) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };
  const { error } = await supabase.from("products").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

/** Manual stock change, written to the ledger so the history stays complete. */
export async function adjustStock({ productId, delta, reason = "restock", note }) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const { data: product } = await supabase
    .from("products")
    .select("stock")
    .eq("id", productId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!product) return { success: false, message: "Product not found" };

  const next = Math.max(0, product.stock + Number(delta));
  const { error } = await supabase
    .from("products")
    .update({ stock: next })
    .eq("id", productId)
    .eq("user_id", user.id);
  if (error) return { success: false, message: error.message };

  await supabase.from("stock_movements").insert({
    user_id: user.id,
    product_id: productId,
    delta: Number(delta),
    reason,
    note: note || null,
  });

  return { success: true, stock: next };
}

export async function getStockMovements(productId) {
  const { supabase, user } = await scoped();
  if (!user) return [];
  const { data, error } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("user_id", user.id)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

/* ─────────────────────────────── services ────────────────────────────── */

function serviceText(s) {
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

export async function getServices(filters = {}) {
  const { supabase, user } = await scoped();
  if (!user) return [];

  let query = supabase
    .from("services")
    .select("*")
    .eq("user_id", user.id)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(({ embedding, ...rest }) => rest);
}

export async function createService(service) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const embedding = await generateEmbedding(serviceText(service));
  const { data, error } = await supabase
    .from("services")
    .insert({ ...service, user_id: user.id, embedding })
    .select("id")
    .single();

  if (error) return { success: false, message: error.message };
  return { success: true, data };
}

export async function updateService(id, updates) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const { data: existing } = await supabase
    .from("services")
    .select("name, description, category, price, currency, duration_min")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) return { success: false, message: "Service not found" };

  const patch = { ...updates };
  const merged = { ...existing, ...updates };
  const textChanged = ["name", "description", "category", "price", "currency", "duration_min"].some(
    (k) => updates[k] !== undefined && updates[k] !== existing[k],
  );
  if (textChanged) patch.embedding = await generateEmbedding(serviceText(merged));

  const { error } = await supabase
    .from("services")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function deleteService(id) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };
  const { error } = await supabase.from("services").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

/* ──────────────────────────── staff & hours ──────────────────────────── */

export async function getStaff() {
  const { supabase, user } = await scoped();
  if (!user) return [];
  const { data, error } = await supabase
    .from("staff")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createStaff(member) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };
  const { error } = await supabase.from("staff").insert({ ...member, user_id: user.id });
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function updateStaff(id, updates) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };
  const { error } = await supabase.from("staff").update(updates).eq("id", id).eq("user_id", user.id);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function deleteStaff(id) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };
  const { error } = await supabase.from("staff").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function getBusinessHours() {
  const { supabase, user } = await scoped();
  if (!user) return [];
  const { data, error } = await supabase
    .from("business_hours")
    .select("*")
    .eq("user_id", user.id)
    .order("weekday", { ascending: true });
  if (error) throw error;

  // Fill the week so the editor always has seven rows to render.
  const byDay = new Map((data || []).map((d) => [d.weekday, d]));
  return Array.from({ length: 7 }, (_, wd) =>
    byDay.get(wd) || { weekday: wd, opens: "09:00", closes: "18:00", closed: wd === 0, user_id: user.id },
  );
}

export async function saveBusinessHours(rows) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const payload = rows.map((r) => ({
    user_id: user.id,
    weekday: r.weekday,
    opens: r.opens,
    closes: r.closes,
    closed: Boolean(r.closed),
  }));

  const { error } = await supabase
    .from("business_hours")
    .upsert(payload, { onConflict: "user_id,weekday" });

  if (error) return { success: false, message: error.message };
  return { success: true };
}

/* ──────────────────────────────── images ─────────────────────────────── */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

/**
 * Upload one catalogue image and return its public URL.
 *
 * Files are namespaced by user id so one account can never overwrite
 * another's, and the bucket is public because the widget shows these images
 * to customers who have no session.
 */
export async function uploadCatalogueImage(formData) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const file = formData.get("file");
  if (!file || typeof file === "string") return { success: false, message: "No file given" };
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { success: false, message: "Use a PNG, JPEG, WEBP, GIF or AVIF image." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { success: false, message: "Images must be 5 MB or smaller." };
  }

  const ext = (file.name?.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

  // Storage writes need the service role; the SSR client is the user here.
  const service = createServiceClient();
  const { error } = await service.storage
    .from("catalogue")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return { success: false, message: error.message };

  const { data } = service.storage.from("catalogue").getPublicUrl(path);
  return { success: true, url: data.publicUrl };
}

export async function deleteCatalogueImage(url) {
  const { user } = await scoped();
  if (!user || !url) return { success: false, message: "Unauthorized" };

  const marker = "/catalogue/";
  const at = url.indexOf(marker);
  if (at === -1) return { success: false, message: "Not a catalogue image" };
  const path = url.slice(at + marker.length);

  // Refuse to touch a path outside the caller's own folder.
  if (!path.startsWith(`${user.id}/`)) {
    return { success: false, message: "Not your image" };
  }

  const service = createServiceClient();
  const { error } = await service.storage.from("catalogue").remove([path]);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

/* ────────────────────── which masters do which service ───────────────── */

export async function getServiceStaffMap() {
  const { supabase, user } = await scoped();
  if (!user) return {};

  const { data, error } = await supabase
    .from("service_staff")
    .select("service_id, staff_id, services!inner(user_id)")
    .eq("services.user_id", user.id);

  if (error) throw error;

  const map = {};
  for (const row of data || []) {
    (map[row.service_id] ||= []).push(row.staff_id);
  }
  return map;
}

/** Replace the assignment set for one service. Empty means "anyone can". */
export async function setServiceStaff(serviceId, staffIds) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const { data: owned } = await supabase
    .from("services")
    .select("id")
    .eq("id", serviceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) return { success: false, message: "Service not found" };

  const { error: delError } = await supabase
    .from("service_staff")
    .delete()
    .eq("service_id", serviceId);
  if (delError) return { success: false, message: delError.message };

  if (staffIds?.length) {
    const { error } = await supabase
      .from("service_staff")
      .insert(staffIds.map((staff_id) => ({ service_id: serviceId, staff_id })));
    if (error) return { success: false, message: error.message };
  }

  return { success: true };
}

/* ───────────────────────────── staff shifts ──────────────────────────── */

export async function getStaffHours(staffId) {
  const { supabase, user } = await scoped();
  if (!user || !staffId) return [];

  const { data, error } = await supabase
    .from("staff_hours")
    .select("*")
    .eq("user_id", user.id)
    .eq("staff_id", staffId)
    .order("weekday", { ascending: true });
  if (error) throw error;

  // Always hand back seven rows so the editor has a full week to render.
  const byDay = new Map((data || []).map((d) => [d.weekday, d]));
  return Array.from({ length: 7 }, (_, wd) =>
    byDay.get(wd) || {
      weekday: wd,
      staff_id: staffId,
      starts_at: "10:00",
      ends_at: "19:00",
      off: wd === 0,
    },
  );
}

export async function saveStaffHours(staffId, rows) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const { data: owned } = await supabase
    .from("staff")
    .select("id")
    .eq("id", staffId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) return { success: false, message: "Not your team member" };

  const payload = rows.map((r) => ({
    user_id: user.id,
    staff_id: staffId,
    weekday: r.weekday,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    off: Boolean(r.off),
  }));

  const { error } = await supabase
    .from("staff_hours")
    .upsert(payload, { onConflict: "staff_id,weekday" });

  if (error) return { success: false, message: error.message };
  return { success: true };
}
