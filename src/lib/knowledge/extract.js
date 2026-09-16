/**
 * Read a business out of its own website.
 *
 * The slowest part of getting started is typing in what already exists on the
 * seller's site: opening hours, the price list, the policies. This asks the
 * model to pull those out as records the dashboard can actually create —
 * services, products, hours and knowledge entries — rather than a wall of text.
 *
 * Everything it returns is a proposal. The seller confirms before anything is
 * written, because a wrong price is worse than a missing one.
 */

import Anthropic from "@anthropic-ai/sdk";
import { resolveModel } from "@/lib/ai/models";
import { creditsFor } from "@/lib/ai/pricing";

let client;
function anthropic() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const SHAPE = `{
  "business": { "name": string, "about": string, "phone": string|null, "address": string|null },
  "hours": [ { "weekday": 0-6 (0=Sunday), "opens": "HH:MM", "closes": "HH:MM", "closed": boolean } ],
  "services": [ { "name": string, "description": string, "price": number, "duration_min": number, "category": string|null } ],
  "products": [ { "name": string, "description": string, "price": number } ],
  "faqs": [ { "title": string, "content": string } ]
}`;

const RULES = [
  "Only use what the pages actually say. Never invent a price, a duration or an opening hour.",
  "Leave a list empty rather than guessing. An empty list is a correct answer.",
  "Prices are plain numbers in the shop's own currency, with no symbols or spaces.",
  "A service is something booked for a length of time. A product is something sold and handed over.",
  "If a duration is not stated, use 60 for a service.",
  "Hours: give one entry per weekday you can actually determine, and mark the rest closed only if the page says so.",
  "faqs are for anything a customer would ask that is not a price or an hour: parking, policies, payment, children, allergies.",
  "Keep every field in the language the website is written in.",
].map((r) => `- ${r}`).join("\n");

/**
 * Pull structured business data out of the pages.
 *
 * Returns { data, usage } so the caller can bill for it like any other model
 * call — this is not free, and a seller importing ten sites should pay for ten.
 */
export async function extractBusiness(pages, { timezone } = {}) {
  const corpus = pages
    .map((p) => `### ${p.title}\n${p.url}\n\n${p.text}`)
    .join("\n\n---\n\n")
    .slice(0, 60_000);   // a whole site of prose is more than enough

  const model = resolveModel("claude-sonnet");

  const message = await anthropic().messages.create({
    model: model.id,
    max_tokens: 4096,
    system:
      "You read a small business's website and return what it says about itself as JSON. " +
      "You are filling in a dashboard for the owner, who will check it. Accuracy matters far " +
      "more than completeness.",
    messages: [
      {
        role: "user",
        content:
          `Return ONLY JSON in this shape, with no commentary and no code fence:\n${SHAPE}\n\n` +
          `Rules:\n${RULES}\n\n` +
          (timezone ? `The business runs on ${timezone} time.\n\n` : "") +
          `Website:\n\n${corpus}`,
      },
    ],
  });

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    // Models add a fence even when told not to.
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "");

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Could not make sense of that website. Try a page with prices or opening hours on it.");
  }

  const usage = {
    model: model.id,
    inputTokens: message.usage?.input_tokens || 0,
    outputTokens: message.usage?.output_tokens || 0,
  };

  return { data: clean(data), usage, credits: creditsFor({ ...usage, model: model.id }) };
}

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const str = (v, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Anything malformed is dropped rather than shown to the seller as truth. */
function clean(raw) {
  const out = {
    business: {
      name: str(raw?.business?.name, 120),
      about: str(raw?.business?.about, 800),
      phone: str(raw?.business?.phone, 60) || null,
      address: str(raw?.business?.address, 200) || null,
    },
    hours: [],
    services: [],
    products: [],
    faqs: [],
  };

  const time = (v) => (/^\d{1,2}:\d{2}$/.test(String(v || "")) ? String(v).padStart(5, "0") : null);
  for (const h of Array.isArray(raw?.hours) ? raw.hours : []) {
    const weekday = Number(h?.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
    const opens = time(h.opens), closes = time(h.closes);
    if (!h.closed && (!opens || !closes)) continue;
    out.hours.push({ weekday, opens: opens || "09:00", closes: closes || "18:00", closed: Boolean(h.closed) });
  }

  for (const s of Array.isArray(raw?.services) ? raw.services : []) {
    const name = str(s?.name, 120);
    if (!name) continue;
    out.services.push({
      name,
      description: str(s?.description, 600),
      price: num(s?.price),
      duration_min: Math.max(5, Math.round(num(s?.duration_min) || 60)),
      category: str(s?.category, 60) || null,
    });
  }

  for (const p of Array.isArray(raw?.products) ? raw.products : []) {
    const name = str(p?.name, 120);
    if (!name) continue;
    out.products.push({ name, description: str(p?.description, 600), price: num(p?.price) });
  }

  for (const f of Array.isArray(raw?.faqs) ? raw.faqs : []) {
    const title = str(f?.title, 160);
    const content = str(f?.content, 1500);
    if (!title || !content) continue;
    out.faqs.push({ title, content });
  }

  // Duplicated names would become duplicated catalogue rows.
  const unique = (list) => {
    const seen = new Set();
    return list.filter((x) => {
      const key = x.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  out.services = unique(out.services).slice(0, 40);
  out.products = unique(out.products).slice(0, 60);
  out.faqs = out.faqs.slice(0, 30);

  return out;
}
