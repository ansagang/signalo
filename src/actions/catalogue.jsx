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

export async function getServiceStaffMap() {
  return query((db, user) => catalogue.getServiceStaffMap(db, user.id), {});
}

export async function setServiceStaff(serviceId, staffIds) {
  return action((db, user) => catalogue.setServiceStaff(db, user.id, serviceId, staffIds));
}

export async function setStaffServices(staffId, serviceIds) {
  return action((db, user) => catalogue.setStaffServices(db, user.id, staffId, serviceIds));
}

/* ──────────────────────────── staff & hours ──────────────────────────── */

export async function getStaff() {
  return query((db, user) => catalogue.listStaff(db, user.id), []);
}

export async function createStaff(member) {
  return action((db, user) => catalogue.createStaff(db, user.id, member));
}

export async function updateStaff(id, updates) {
  return action((db, user) => catalogue.updateStaff(db, user.id, id, updates));
}

export async function deleteStaff(id) {
  return action((db, user) => catalogue.deleteStaff(db, user.id, id));
}

export async function getBusinessHours() {
  return query((db, user) => catalogue.listBusinessHours(db, user.id), []);
}

export async function saveBusinessHours(rows) {
  return action((db, user) => catalogue.saveBusinessHours(db, user.id, rows));
}

export async function getStaffHours(staffId) {
  if (!staffId) return [];
  return query((db, user) => catalogue.listStaffHours(db, user.id, staffId), []);
}

export async function saveStaffHours(staffId, rows) {
  return action((db, user) => catalogue.saveStaffHours(db, user.id, staffId, rows));
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
