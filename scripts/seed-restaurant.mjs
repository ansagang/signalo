/**
 * Seeds a seating-based business (restaurant) — tables as resources, a
 * "book a table" service in `seating` mode, a host persona and its channel.
 * Demonstrates that the booking model is not salon-specific.
 *
 *   node scripts/seed-restaurant.mjs <user-email>
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
console.log(`seeding restaurant for ${email}`);

/* ── tables ── */
const tables = [
  { name: "Window 1", capacity: 2 }, { name: "Window 2", capacity: 2 },
  { name: "Centre 3", capacity: 4 }, { name: "Centre 4", capacity: 4 },
  { name: "Corner 5", capacity: 6 }, { name: "Long table", capacity: 10 },
];
for (const t of tables) {
  const [found] = await rest(`resources?select=id&user_id=eq.${USER}&name=eq.${encodeURIComponent(t.name)}`);
  const row = { ...t, user_id: USER, kind: "table", icon: "🍽️", active: true };
  if (found) await rest(`resources?id=eq.${found.id}`, { method: "PATCH", body: JSON.stringify(row) });
  else await rest("resources", { method: "POST", body: JSON.stringify(row) });
  console.log(`· table: ${t.name} (${t.capacity} seats)`);
}

/* ── the bookable ── */
const service = {
  user_id: USER, name: "Table reservation", category: "Dining",
  description: "A table held for your party for 90 minutes. Kitchen closes at 22:00.",
  duration_min: 90, buffer_min: 15, price: 0, currency: "kzt",
  booking_mode: "seating", min_party: 1, max_party: 10,
  slot_mode: "grid", slot_step_min: 30, lead_time_min: 60, active: true,
};
const text = `${service.name} — ${service.description} — seating for 1 to 10 people — 90 minutes`;
const [existing] = await rest(`resources?select=id&user_id=eq.${USER}&name=eq.x`); // no-op probe
const [svcFound] = await rest(`services?select=id&user_id=eq.${USER}&name=eq.${encodeURIComponent(service.name)}`);
let serviceId;
if (svcFound) {
  serviceId = svcFound.id;
  await rest(`services?id=eq.${serviceId}`, { method: "PATCH", body: JSON.stringify({ ...service, embedding: await embed(text) }) });
} else {
  const [s] = await rest("services", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...service, embedding: await embed(text) }) });
  serviceId = s.id;
}
console.log("· service: Table reservation (seating, 1–10)");

/* ── every table can serve it ── */
const allTables = await rest(`resources?select=id&user_id=eq.${USER}&kind=eq.table`);
await rest(`service_resources?service_id=eq.${serviceId}`, { method: "DELETE" });
for (const t of allTables) {
  await rest("service_resources", { method: "POST", body: JSON.stringify({ service_id: serviceId, resource_id: t.id }) });
}
console.log(`· linked ${allTables.length} tables`);

/* ── persona + channel ── */
const persona = {
  user_id: USER, preset_id: "restaurant", name: "Dana", tone: "friendly", language: "auto",
  model: "claude",
  greeting: "Hi! This is Dana at Saltanat. Would you like to book a table?",
  prompt: "You are the host at Saltanat, a restaurant on Dostyk 12 in Almaty. Tables are held for 90 minutes. Kitchen closes at 22:00. We do not take deposits.",
  traits: "Warm, efficient, always confirms the party size before offering times.",
  temperature: 0.7, max_tokens: 1024, fallback_behavior: "escalate",
  escalation_triggers: "complaint, allergy, large group over 10, private event",
  is_active: false,
};
const [pFound] = await rest(`personas?select=id&user_id=eq.${USER}&name=eq.Dana`);
let personaId;
if (pFound) { personaId = pFound.id; await rest(`personas?id=eq.${personaId}`, { method: "PATCH", body: JSON.stringify(persona) }); }
else { const [p] = await rest("personas", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(persona) }); personaId = p.id; }

const [cFound] = await rest(`channels?select=id,public_key&user_id=eq.${USER}&name=eq.${encodeURIComponent("Saltanat widget")}`);
let key;
if (cFound) { key = cFound.public_key; await rest(`channels?id=eq.${cFound.id}`, { method: "PATCH", body: JSON.stringify({ persona_id: personaId, is_active: true }) }); }
else {
  const [c] = await rest("channels", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: USER, persona_id: personaId, type: "web", name: "Saltanat widget",
      public_key: `sg_live_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      config: { title: "Saltanat", accent: "#c2410c", theme: "dark", avatarShape: "coffee" },
    }),
  });
  key = c.public_key;
}
console.log(`\npersona_id : ${personaId}\npublic_key : ${key}`);
