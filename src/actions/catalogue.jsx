"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { action, query } from "@/lib/session";
import * as catalogue from "@/lib/services/catalogue";

/* ─────────────────────────────── products ────────────────────────────── */

export async function getProducts(filters) {
  return query((db, user) => catalogue.listProducts(db, user.id, filters), []);
}

export async function createProduct(product) {
  return action((db, user) => catalogue.createProduct(db, user.id, product));
}

export async function updateProduct(id, updates) {
  return action((db, user) => catalogue.updateProduct(db, user.id, id, updates));
}

export async function deleteProduct(id) {
  return action((db, user) => catalogue.deleteProduct(db, user.id, id));
}

export async function adjustStock(input) {
  return action((db, user) => catalogue.adjustStock(db, user.id, input));
}

export async function resetStock(productId = null) {
  return action((db, user) => catalogue.resetStock(db, user.id, productId));
}

export async function getStockMovements(productId) {
  return query((db, user) => catalogue.listStockMovements(db, user.id, productId), []);
}

/* ─────────────────────────────── services ────────────────────────────── */

export async function getServices(filters) {
  return query((db, user) => catalogue.listServices(db, user.id, filters), []);
}

export async function createService(service) {
  return action((db, user) => catalogue.createService(db, user.id, service));
}

export async function updateService(id, updates) {
  return action((db, user) => catalogue.updateService(db, user.id, id, updates));
}

export async function deleteService(id) {
  return action((db, user) => catalogue.deleteService(db, user.id, id));
}

export async function getServiceResourceMap() {
  return query((db, user) => catalogue.getServiceResourceMap(db, user.id), {});
}

export async function setServiceResources(serviceId, resourceIds) {
  return action((db, user) => catalogue.setServiceResources(db, user.id, serviceId, resourceIds));
}

export async function setResourceServices(resourceId, serviceIds) {
  return action((db, user) => catalogue.setResourceServices(db, user.id, resourceId, serviceIds));
}

/* ─────────────────────── resources & their hours ─────────────────────── */

export async function getResources() {
  return query((db, user) => catalogue.listResources(db, user.id), []);
}

export async function createResource(member) {
  return action((db, user) => catalogue.createResource(db, user.id, member));
}

export async function updateResource(id, updates) {
  return action((db, user) => catalogue.updateResource(db, user.id, id, updates));
}

export async function deleteResource(id) {
  return action((db, user) => catalogue.deleteResource(db, user.id, id));
}

export async function getBusinessHours() {
  return query((db, user) => catalogue.listBusinessHours(db, user.id), []);
}

export async function saveBusinessHours(rows) {
  return action((db, user) => catalogue.saveBusinessHours(db, user.id, rows));
}

export async function getResourceHours(resourceId) {
  if (!resourceId) return [];
  return query((db, user) => catalogue.listResourceHours(db, user.id, resourceId), []);
}

export async function saveResourceHours(resourceId, rows) {
  return action((db, user) => catalogue.saveResourceHours(db, user.id, resourceId, rows));
}

/* ──────────────────────────────── images ─────────────────────────────── */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

export async function uploadCatalogueImage(formData) {
  return action(async (_db, user) => {
    const file = formData.get("file");
    if (!file || typeof file === "string") throw new Error("No file given");
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error("Use a PNG, JPEG, WEBP, GIF or AVIF image.");
    }
    if (file.size > MAX_IMAGE_BYTES) throw new Error("Images must be 5 MB or smaller.");

    const ext = (file.name?.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    // Namespaced by user so one account can never overwrite another's files.
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    // Storage writes need the service role; the session client is the user.
    const service = createServiceClient();
    const { error } = await service.storage
      .from("catalogue")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;

    const { data } = service.storage.from("catalogue").getPublicUrl(path);
    return { url: data.publicUrl };
  });
}

export async function deleteCatalogueImage(url) {
  return action(async (_db, user) => {
    const marker = "/catalogue/";
    const at = (url || "").indexOf(marker);
    if (at === -1) throw new Error("Not a catalogue image");

    const path = url.slice(at + marker.length);
    if (!path.startsWith(`${user.id}/`)) throw new Error("Not your image");

    const service = createServiceClient();
    const { error } = await service.storage.from("catalogue").remove([path]);
    if (error) throw error;
  });
}

/** The business's clock. Everything time-shaped is resolved against it. */
export async function saveTimezone(timezone) {
  return action(async (db, user) => {
    const { error } = await db
      .from("profiles")
      .update({ timezone })
      .eq("id", user.id);
    if (error) throw error;
  });
}
