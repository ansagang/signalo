/**
 * Seeds a complete restaurant account you can log into and click around.
 *
 * Written for the current model, where the old "places" idea is gone:
 *   · a bookable sitting is a SERVICE with a max party and a host assigned
 *   · the tables themselves are PRODUCTS whose stock is how many exist,
 *     so an order takes one and "Reset availability" frees them all again
 *
 *   node scripts/seed-restaurant.mjs [email] [password]
 */
import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env"), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };
const REP = { Prefer: "return=representation" };

const rest = async (p, init = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${p} → ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
};

async function embed(text) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!r.ok) throw new Error(`embeddings → ${r.status}`);
  return (await r.json()).data[0].embedding;
}

const EMAIL = process.argv[2] || "resto@signalo.app";
const PASSWORD = process.argv[3] || "SignaloResto2026!";

/* ── the account itself ─────────────────────────────────────────────── */

async function ensureUser() {
  const [existing] = await rest(`profiles?select=id&email=eq.${encodeURIComponent(EMAIL)}`);
  if (existing) { console.log(`· account: ${EMAIL} (already exists)`); return existing.id; }

  const r = await fetch(`${U}/auth/v1/admin/users`, {
    method: "POST", headers: H,
    body: JSON.stringify({
      email: EMAIL, password: PASSWORD, email_confirm: true,
      user_metadata: { full_name: "Sandyq Restaurant" },
    }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`create user → ${r.status} ${JSON.stringify(body)}`);
  const id = body.id;

  // A profile row may or may not be created by a trigger; make sure of it.
  const [p] = await rest(`profiles?select=id&id=eq.${id}`);
  if (!p) {
    await rest("profiles", {
      method: "POST",
      body: JSON.stringify({ id, email: EMAIL, full_name: "Sandyq Restaurant", lang: "en", role: "user" }),
    });
  } else {
    await rest(`profiles?id=eq.${id}`, {
      method: "PATCH", body: JSON.stringify({ full_name: "Sandyq Restaurant", email: EMAIL }),
    });
  }
  console.log(`· account created: ${EMAIL} / ${PASSWORD}`);
  return id;
}

const USER = await ensureUser();

/** Insert, or update the row that already has this name. */
async function upsert(table, matchCol, value, row) {
  const [found] = await rest(`${table}?select=id&user_id=eq.${USER}&${matchCol}=eq.${encodeURIComponent(value)}`);
  if (found) {
    await rest(`${table}?id=eq.${found.id}`, { method: "PATCH", body: JSON.stringify(row) });
    return found.id;
  }
  const [created] = await rest(table, { method: "POST", headers: REP, body: JSON.stringify(row) });
  return created.id;
}

/* ── the people guests are booked with ──────────────────────────────── */

const team = [
  { name: "Aisulu", role_title: "Host", icon: "🌸" },
  { name: "Timur", role_title: "Head waiter & sommelier", icon: "🍷" },
  { name: "Yerlan", role_title: "Chef", icon: "👨‍🍳" },
];
const staff = {};
for (const m of team) {
  staff[m.name] = await upsert("resources", "name", m.name, {
    ...m, user_id: USER, kind: "person", capacity: 1, active: true,
  });
  console.log(`· team: ${m.name} — ${m.role_title}`);
}

/* ── hours: every day, noon to 23:00 ────────────────────────────────── */

for (let wd = 0; wd <= 6; wd++) {
  await rest("business_hours?on_conflict=user_id,weekday", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: USER, weekday: wd, opens: "12:00", closes: "23:00", closed: false }),
  });
}
console.log("· hours: every day 12:00–23:00");

/* ── what a guest can book ──────────────────────────────────────────── */

const services = [
  { name: "Table reservation", category: "Dining", duration_min: 90, buffer_min: 15, price: 0,
    max_party: 6, capacity: 22, host: null,
    description: "A table held for your party for 90 minutes. Kitchen closes at 22:00." },
  { name: "Large party dinner", category: "Dining", duration_min: 150, buffer_min: 30, price: 0,
    max_party: 14, capacity: 3, host: null,
    description: "Seven to fourteen guests, seated together. Set menu agreed a day ahead." },
  { name: "Chef's tasting menu", category: "Experience", duration_min: 150, buffer_min: 30, price: 24000,
    max_party: 8, capacity: 8, host: "Yerlan", mode: "class", slots: "grid",
    description: "Seven courses of modern Kazakh cooking at the kitchen counter. Per guest. Allergies need a day's notice." },
  { name: "Wine tasting", category: "Experience", duration_min: 90, buffer_min: 15, price: 15000,
    max_party: 10, capacity: 10, host: "Timur", mode: "class", slots: "grid",
    description: "Six Georgian and Kazakh wines with snacks, led by our sommelier. Per guest. Thursdays and Fridays." },
  { name: "Private dining room", category: "Events", duration_min: 240, buffer_min: 30, price: 60000,
    max_party: 16, capacity: 1, host: null,
    description: "The upstairs room to yourselves for four hours. Room fee, food and drink charged on top." },
];

for (const s of services) {
  const { host, mode, slots, ...row } = s;
  const text = `${s.name} — ${s.description} — category: ${s.category} — ${s.duration_min} minutes — up to ${s.max_party} guests — price ${s.price} KZT`;
  const id = await upsert("services", "name", s.name, {
    ...row, user_id: USER, currency: "kzt", active: true,
    // "any" suggests half-hours but takes the time the guest names; a sitting
    // everyone joins together stays on its grid.
    slot_mode: slots || "any", slot_step_min: 30, lead_time_min: 60,
    // 'class' shares one sitting between guests; everything else takes a table.
    booking_mode: mode || "appointment",
    min_party: 1, embedding: await embed(text),
  });

  // Only work a named person performs gets one attached.
  await rest(`service_resources?service_id=eq.${id}`, { method: "DELETE" });
  if (host) {
    await rest("service_resources", {
      method: "POST", body: JSON.stringify({ service_id: id, resource_id: staff[host] }),
    });
  }
  console.log(`· bookable: ${s.name} — up to ${s.max_party} guests, ${s.capacity} at once${host ? `, run by ${host}` : ""}`);
}

/* ── the tables, as stock ───────────────────────────────────────────── */

const products = [
  // Tables are NOT here. A table is booked for a span of time, so it is a
  // service with a capacity ("Table reservation", 22 at once). Products are
  // things that leave the building.
  { name: "House wine — Saperavi", category: "Retail", stock: 24, price: 9000,
    description: "Dry red from Kakheti. Bottle to take home." },
  { name: "Sandyq spice set", category: "Retail", stock: 15, price: 6500,
    description: "Three jars: zira, sumac and our own lamb rub, in a wooden box." },
  { name: "Gift card 20,000 ₸", category: "Retail", stock: 30, price: 20000,
    description: "Spendable on anything, valid a year." },
]

for (const pr of products) {
  const text = `${pr.name} — ${pr.description} — category: ${pr.category} — price ${pr.price || 0} KZT`;
  await upsert("products", "name", pr.name, {
    ...pr, user_id: USER, price: pr.price || 0, currency: "kzt",
    // Tables are put back every service; retail is restocked by hand.
    initial_stock: pr.stock, low_stock_at: 5,
    track_stock: true, active: true, embedding: await embed(text),
  });
  console.log(`· product: ${pr.name} ×${pr.stock}`);
}

/* ── what the assistant needs to know ───────────────────────────────── */

const entries = [
  { type: "faq", title: "Where are you and where do I park?",
    content: "Sandyq is at Dostyk 132, Almaty, on the corner with Zholdasbekov. Free parking in the courtyard behind the building, entrance from Zholdasbekov. Ten minutes on foot from Abay metro.",
    keywords: "address, where, parking, metro, adres, parkovka, how to get", priority: 10, metadata: { category: "Visiting" } },
  { type: "policy", title: "Holding, cancelling and late arrivals",
    content: "We hold a table for 15 minutes past the booking time, then release it. Cancel or move free of charge up to 3 hours before. Large parties of 7 or more and the private room need 24 hours' notice, otherwise we charge 5,000 KZT per guest.",
    keywords: "cancel, late, hold, no show, otmena, opozdanie, bronirovanie", priority: 10, metadata: {} },
  { type: "faq", title: "Do you cater for allergies, halal or vegetarians?",
    content: "All our meat is halal. There are four vegetarian mains and two vegan ones on the standard menu. Tell us about allergies when booking — for the tasting menu we need a day's notice to change courses.",
    keywords: "halal, allergy, vegetarian, vegan, gluten, allergia, veg", priority: 9, metadata: { category: "Menu" } },
  { type: "faq", title: "Can I come with children?",
    content: "Yes. We have six highchairs and a children's menu at 2,500 KZT. The terrace is the easiest place with a pram.",
    keywords: "children, kids, highchair, baby, deti, pram", priority: 7, metadata: { category: "Visiting" } },
  { type: "faq", title: "How do I pay?",
    content: "Cash, card or Kaspi at the restaurant. Corporate events and the private room can be invoiced — ask for Aisulu. We never take card details over chat.",
    keywords: "pay, payment, kaspi, card, invoice, oplata, schet", priority: 9, metadata: { category: "Payment" } },
  { type: "faq", title: "Is there live music or a dress code?",
    content: "Live dombra and jazz on Friday and Saturday from 20:00. No dress code, though most guests dress smart-casual in the evening.",
    keywords: "music, live, dress code, friday, saturday, muzyka", priority: 6, metadata: { category: "Visiting" } },
];

for (const e of entries) {
  const text = [e.title, e.content, `Keywords: ${e.keywords}`, `Type: ${e.type}`].join(" — ");
  await upsert("knowledge_entries", "title", e.title, {
    ...e, user_id: USER, persona_id: null, active: true, embedding: await embed(text),
  });
  console.log(`· ${e.type}: ${e.title}`);
}

/* ── the assistant, and where guests meet it ────────────────────────── */

const personaId = await upsert("personas", "name", "Dana", {
  user_id: USER, preset_id: "restaurant", name: "Dana", tone: "friendly", language: "auto",
  model: "claude", icon: "🍽️",
  greeting: "Сәлеметсіз бе! Dana here from Sandyq. A table, or something else?",
  prompt:
    "You are the host at Sandyq, a modern Kazakh restaurant at Dostyk 132 in Almaty. Open every day 12:00–23:00; the kitchen closes at 22:00. " +
    "Guests book a sitting: a normal table reservation takes up to 6, a large party dinner up to 14, and there is a chef's tasting menu, a wine tasting and a private room. " +
    "Always ask how many guests are coming before you offer times, because it decides what you can offer. " +
    "Quote prices per guest for the tasting menu and wine tasting. Never invent a dish that is not in the catalogue.",
  traits: "Warm and quick. Confirms the party size, the day and the time back to the guest before booking anything.",
  temperature: 0.7, max_tokens: 1024, fallback_behavior: "escalate",
  blocked_topics: "detailed nutritional or medical advice",
  escalation_triggers: "complaint, refund, allergic reaction, food poisoning, manager, corporate invoice",
  is_active: true,
});
console.log("· persona: Dana");

const [chan] = await rest(`channels?select=id,public_key&user_id=eq.${USER}&name=eq.${encodeURIComponent("Sandyq widget")}`);
let key;
if (chan) {
  key = chan.public_key;
  await rest(`channels?id=eq.${chan.id}`, { method: "PATCH", body: JSON.stringify({ persona_id: personaId, is_active: true }) });
} else {
  const [c] = await rest("channels", {
    method: "POST", headers: REP,
    body: JSON.stringify({
      user_id: USER, persona_id: personaId, type: "web", name: "Sandyq widget",
      public_key: `sg_live_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      config: {
        title: "Sandyq", accent: "#c2410c", theme: "dark", avatarShape: "utensils",
        greetingBubble: "Book a table?", autoOpen: false, autoOpenDelay: 8,
      },
    }),
  });
  key = c.public_key;
}
console.log("· channel: Sandyq widget");

console.log(`\nlogin      : ${EMAIL} / ${PASSWORD}`);
console.log(`persona_id : ${personaId}`);
console.log(`public_key : ${key}`);

/* ── a week of bookings, so the timetable has something in it ───────── */

const TZ_OFFSET = "+05:00";                 // Asia/Almaty
const dayISO = (addDays) => {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  return d.toISOString().slice(0, 10);
};
const at = (addDays, hhmm, minutes) => {
  const start = new Date(`${dayISO(addDays)}T${hhmm}:00${TZ_OFFSET}`);
  const end = new Date(start.getTime() + minutes * 60000);
  return { starts_at: start.toISOString(), ends_at: end.toISOString() };
};

const svcByName = Object.fromEntries(
  (await rest(`services?select=id,name,duration_min,price&user_id=eq.${USER}`)).map((s) => [s.name, s]),
);

const bookings = [
  [0, "13:00", "Table reservation", null, 2, "Aigerim", "+7 701 214 8890", "confirmed"],
  [0, "14:30", "Table reservation", null, 4, "Nurlan", "+7 705 331 0042", "confirmed"],
  [0, "18:00", "Chef's tasting menu", "Yerlan", 6, "Dmitri", "+7 707 884 1201", "booked"],
  [0, "19:00", "Table reservation", null, 3, "Saltanat", "+7 700 552 7714", "booked"],
  [0, "20:30", "Large party dinner", null, 11, "Kanat (corporate)", "+7 727 315 9900", "booked"],
  [1, "13:30", "Table reservation", null, 2, "Madina", "+7 701 990 2213", "booked"],
  [1, "19:00", "Wine tasting", "Timur", 8, "Wine club", "+7 702 118 4455", "confirmed"],
  [1, "20:00", "Table reservation", null, 5, "Askar", "+7 708 447 3321", "booked"],
  [2, "18:30", "Private dining room", null, 14, "Halyk Bank", "+7 727 258 1100", "confirmed"],
  [2, "19:30", "Table reservation", null, 2, "Zhanna", "+7 705 663 8812", "booked"],
  [3, "19:00", "Chef's tasting menu", "Yerlan", 4, "Olga", "+7 701 774 5590", "booked"],
  [-1, "19:00", "Table reservation", null, 4, "Bekzat", "+7 707 220 6631", "completed"],
  [-1, "20:00", "Wine tasting", "Timur", 6, "Tasting group", "+7 702 889 1145", "completed"],
  [-2, "18:00", "Table reservation", null, 2, "Arman", "+7 700 341 7782", "no_show"],
];

let made = 0;
for (const [d, time, svcName, host, party, who, phone, status] of bookings) {
  const svc = svcByName[svcName];
  if (!svc) continue;
  const { starts_at, ends_at } = at(d, time, svc.duration_min);

  const [dupe] = await rest(
    `appointments?select=id&user_id=eq.${USER}&starts_at=eq.${encodeURIComponent(starts_at)}&customer_name=eq.${encodeURIComponent(who)}`,
  );
  if (dupe) continue;

  await rest("appointments", {
    method: "POST",
    body: JSON.stringify({
      user_id: USER, service_id: svc.id, resource_id: host ? staff[host] : null,
      customer_name: who, customer_contact: phone,
      starts_at, ends_at, status, party_size: party,
      // Per-guest experiences bill by head; a table booking itself is free.
      price: Number(svc.price) * (Number(svc.price) > 0 ? party : 0),
      currency: "kzt",
    }),
  });
  made++;
}
console.log(`· bookings: ${made} added across the week`);

