/**
 * Seeds a bookable services business (nail salon) — services, masters,
 * opening hours, a receptionist persona and its own web channel.
 * Safe to re-run.
 *
 *   node scripts/seed-salon.mjs <user-email>
 */
import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env"), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };

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

const email = process.argv[2] || "beta@signalo.app";
const [profile] = await rest(`profiles?select=id&email=eq.${encodeURIComponent(email)}`);
if (!profile) throw new Error(`No profile for ${email}`);
const USER = profile.id;
console.log(`seeding salon for ${email}`);

/* ── masters ── */
const masters = [
  { name: "Aizhan", role_title: "Senior nail artist", icon: "💅" },
  { name: "Madina", role_title: "Nail technician", icon: "✨" },
];
const staffIds = {};
for (const m of masters) {
  const [found] = await rest(`staff?select=id&user_id=eq.${USER}&name=eq.${encodeURIComponent(m.name)}`);
  if (found) { staffIds[m.name] = found.id; }
  else {
    const [row] = await rest("staff", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...m, user_id: USER }),
    });
    staffIds[m.name] = row.id;
  }
  console.log(`· master: ${m.name}`);
}

/* ── opening hours: Mon–Sat 10:00–20:00, closed Sunday ── */
for (let wd = 0; wd <= 6; wd++) {
  const closed = wd === 0;
  await rest("business_hours?on_conflict=user_id,weekday", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: USER, weekday: wd, opens: "10:00", closes: "20:00", closed }),
  });
}
console.log("· hours: Mon–Sat 10:00–20:00, Sun closed");

/* ── services ── */
const services = [
  { name: "Classic manicure", category: "Manicure", duration_min: 45, buffer_min: 10, price: 6000,
    description: "Shaping, cuticle work, buff and a clear or single-colour polish. No gel." },
  { name: "Gel manicure", category: "Manicure", duration_min: 75, buffer_min: 10, price: 9500,
    description: "Full manicure with gel polish, cured under lamp. Lasts two to three weeks. Includes removal of previous gel." },
  { name: "Nail extensions", category: "Extensions", duration_min: 150, buffer_min: 15, price: 18000,
    description: "Gel or acrylic extensions with shaping and colour. Allow two and a half hours." },
  { name: "Nail art (per nail)", category: "Art", duration_min: 20, buffer_min: 0, price: 1500,
    description: "Hand-painted design, chrome, or rhinestones. Priced per nail, added to any manicure." },
  { name: "Classic pedicure", category: "Pedicure", duration_min: 60, buffer_min: 10, price: 8000,
    description: "Foot soak, hard-skin removal, shaping and polish." },
];

for (const s of services) {
  const text = `${s.name} — ${s.description} — category: ${s.category} — ${s.duration_min} minutes — price ${s.price} KZT`;
  const row = { ...s, user_id: USER, currency: "kzt", max_parallel: 2, active: true, embedding: await embed(text) };
  const [found] = await rest(`services?select=id&user_id=eq.${USER}&name=eq.${encodeURIComponent(s.name)}`);
  if (found) await rest(`services?id=eq.${found.id}`, { method: "PATCH", body: JSON.stringify(row) });
  else await rest("services", { method: "POST", body: JSON.stringify(row) });
  console.log(`· service: ${s.name} (${s.duration_min}m, ${s.price}₸)`);
}

/* ── salon FAQs/policies ── */
const entries = [
  { type: "faq", title: "Where are you and how do I get there?",
    content: "We are at Abay 52, Almaty, second floor. Five minutes from Abay metro. Street parking on the side entrance.",
    keywords: "address, where, location, adres, parking, metro", priority: 9, metadata: { category: "Visiting" } },
  { type: "policy", title: "Cancellations and lateness",
    content: "Cancel or move free of charge up to 4 hours before. Under 4 hours or a no-show is charged at 50 percent. If you are more than 15 minutes late we may need to shorten or move the appointment.",
    keywords: "cancel, late, no show, otmena, opozdanie", priority: 10, metadata: {} },
  { type: "faq", title: "How should I pay?",
    content: "Cash or Kaspi transfer at the salon. We do not take card details over chat.",
    keywords: "pay, payment, kaspi, cash, oplata", priority: 9, metadata: { category: "Payment" } },
];

for (const e of entries) {
  const text = [e.title, e.content, `Keywords: ${e.keywords}`, `Type: ${e.type}`].join(" — ");
  const row = { ...e, user_id: USER, persona_id: null, active: true, embedding: await embed(text) };
  const [found] = await rest(`knowledge_entries?select=id&user_id=eq.${USER}&title=eq.${encodeURIComponent(e.title)}`);
  if (found) await rest(`knowledge_entries?id=eq.${found.id}`, { method: "PATCH", body: JSON.stringify(row) });
  else await rest("knowledge_entries", { method: "POST", body: JSON.stringify(row) });
  console.log(`· ${e.type}: ${e.title}`);
}

/* ── persona + channel ── */
const persona = {
  user_id: USER, preset_id: "salon", name: "Aruzhan", tone: "friendly", language: "auto",
  model: "claude", icon: "💅",
  greeting: "Салем! This is Aruzhan at Lumi Nails. Would you like to book in?",
  prompt: "You are the receptionist at Lumi Nails, a nail salon on Abay 52 in Almaty. Two masters: Aizhan (senior) and Madina. Open Mon–Sat 10:00–20:00.",
  traits: "Warm, quick, never keeps a customer waiting for an answer about times.",
  temperature: 0.7, max_tokens: 1024, fallback_behavior: "escalate",
  blocked_topics: "medical advice about nail infections",
  escalation_triggers: "refund, complaint, allergic, infection, manager",
  is_active: false,
};

const [existing] = await rest(`personas?select=id&user_id=eq.${USER}&name=eq.Aruzhan`);
let personaId;
if (existing) { personaId = existing.id; await rest(`personas?id=eq.${personaId}`, { method: "PATCH", body: JSON.stringify(persona) }); }
else {
  const [p] = await rest("personas", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(persona) });
  personaId = p.id;
}
console.log("· persona: Aruzhan");

const [chan] = await rest(`channels?select=id,public_key&user_id=eq.${USER}&name=eq.${encodeURIComponent("Lumi Nails widget")}`);
let key;
if (chan) { key = chan.public_key; await rest(`channels?id=eq.${chan.id}`, { method: "PATCH", body: JSON.stringify({ persona_id: personaId, is_active: true }) }); }
else {
  const [c] = await rest("channels", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: USER, persona_id: personaId, type: "web", name: "Lumi Nails widget",
      public_key: `sg_live_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      config: { title: "Lumi Nails", accent: "#ff5fa2" },
    }),
  });
  key = c.public_key;
}

console.log(`\npersona_id : ${personaId}`);
console.log(`public_key : ${key}`);
