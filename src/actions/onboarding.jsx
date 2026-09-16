"use server";

import { createClient } from "@/lib/supabase/server";
import { readSite } from "@/lib/knowledge/ingest";
import { extractBusiness } from "@/lib/knowledge/extract";
import { entryToText, generateEmbedding } from "@/lib/ai/embeddings";
import { serviceText } from "@/lib/services/catalogue";
import { recordUsage } from "@/lib/services/billing";
import { tzForUser } from "@/lib/timezone";

async function scoped() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Read a seller's website and propose what to create.
 *
 * Nothing is written here. The dashboard shows what was found and the seller
 * confirms — a wrong price they never noticed is worse than a missing one.
 */
export async function analyseSite(url) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  let site;
  try {
    site = await readSite(url);
  } catch (err) {
    return { success: false, message: err?.message || "Could not read that website." };
  }

  try {
    const timezone = await tzForUser(supabase, user.id);
    const { data, usage } = await extractBusiness(site.pages, { timezone });

    // Reading a site costs model tokens like anything else.
    try {
      await recordUsage(supabase, user.id, { ...usage, kind: "chat", channel: "setup" });
    } catch (err) {
      console.error("recordUsage(setup)", err?.message || err);
    }

    return {
      success: true,
      url: site.url,
      title: site.title,
      pages: site.pages.map((p) => p.url),
      data,
    };
  } catch (err) {
    return { success: false, message: err?.message || "Could not read that website." };
  }
}

/**
 * Write the parts the seller kept.
 *
 * Every section is optional, so someone who only wants the opening hours is
 * not forced to take a price list they have not checked.
 */
export async function applySetup({ business, hours, services, products, faqs }) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const made = { services: 0, products: 0, faqs: 0, hours: 0 };

  try {
    if (business?.name) {
      await supabase.from("profiles").update({ full_name: business.name }).eq("id", user.id);
    }

    if (hours?.length) {
      await supabase.from("business_hours").upsert(
        hours.map((h) => ({
          user_id: user.id,
          weekday: h.weekday,
          opens: h.opens,
          closes: h.closes,
          closed: h.closed,
        })),
        { onConflict: "user_id,weekday" },
      );
      made.hours = hours.length;
    }

    for (const s of services || []) {
      const row = {
        user_id: user.id,
        name: s.name,
        description: s.description || "",
        category: s.category || null,
        price: s.price || 0,
        currency: "kzt",
        duration_min: s.duration_min || 60,
        buffer_min: 0,
        capacity: 1,
        // Imported services take the time a customer asks for; the seller can
        // tighten that once they know their own rhythm.
        slot_mode: "any",
        slot_step_min: 30,
        booking_mode: "appointment",
        min_party: 1,
        max_party: 1,
        active: true,
        embedding: await generateEmbedding(serviceText(s)),
      };
      const { error } = await supabase.from("services").insert(row);
      if (!error) made.services += 1;
    }

    for (const p of products || []) {
      const { error } = await supabase.from("products").insert({
        user_id: user.id,
        name: p.name,
        description: p.description || "",
        price: p.price || 0,
        currency: "kzt",
        stock: 0,
        initial_stock: 0,
        low_stock_at: 3,
        // Nothing is known about quantities from a web page, so stock starts
        // untracked rather than claiming zero of everything.
        track_stock: false,
        active: true,
        embedding: await generateEmbedding(
          [p.name, p.description].filter(Boolean).join(" — "),
        ),
      });
      if (!error) made.products += 1;
    }

    for (const f of faqs || []) {
      const entry = {
        type: "faq",
        title: f.title,
        content: f.content,
        keywords: "",
        priority: 5,
        metadata: { imported: true },
      };
      const { error } = await supabase.from("knowledge_entries").insert({
        ...entry,
        user_id: user.id,
        persona_id: null,
        active: true,
        embedding: await generateEmbedding(entryToText(entry)),
      });
      if (!error) made.faqs += 1;
    }

    return { success: true, made };
  } catch (err) {
    return { success: false, message: err?.message || "Could not save that." };
  }
}
