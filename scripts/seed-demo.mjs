/**
 * Seeds a small, realistic catalogue + persona + web channel so the bot has
 * something to sell. Safe to re-run: it upserts by title/name.
 *
 *   node scripts/seed-demo.mjs <user-email>
 */
import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
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
  if (!r.ok) throw new Error(`embeddings → ${r.status} ${await r.text()}`);
  return (await r.json()).data[0].embedding;
}

const email = process.argv[2] || "angsar.aben@gmail.com";
const [profile] = await rest(`profiles?select=id,email&email=eq.${encodeURIComponent(email)}`);
if (!profile) throw new Error(`No profile for ${email}`);
const USER = profile.id;
console.log(`seeding for ${email} (${USER})`);

/* ── persona ── */
const personaRow = {
  user_id: USER,
  preset_id: "demo-shop",
  name: "Aisha",
  tone: "persuasive",
  language: "auto",
  model: "claude",
  icon: "🛍️",
  greeting: "Салем! I'm Aisha from TechNur. Looking for anything in particular today?",
  prompt:
    "You work for TechNur, an accessories shop in Almaty. Delivery across Kazakhstan. Payment on delivery or by Kaspi transfer.",
  traits: "Knows the catalogue cold, never pushy, always names a concrete next step.",
  temperature: 0.7,
  max_tokens: 1024,
  fallback_behavior: "escalate",
  blocked_topics: "competitor pricing, repairs of other brands",
  escalation_triggers: "refund, broken, manager, lawyer, complaint",
  is_active: true,
};

const [existingPersona] = await rest(
  `personas?select=id&user_id=eq.${USER}&name=eq.Aisha`,
);
let personaId;
if (existingPersona) {
  personaId = existingPersona.id;
  await rest(`personas?id=eq.${personaId}`, { method: "PATCH", body: JSON.stringify(personaRow) });
  console.log("· persona updated");
} else {
  const [p] = await rest("personas", {
    method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(personaRow),
  });
  personaId = p.id;
  console.log("· persona created");
}

/* ── catalogue ── */
const products = [
  { name: "AuraBuds Pro wireless earbuds", price: 39900, stock: 24,
    description: "Active noise cancelling earbuds, 32 hours total battery with the case, USB-C fast charge, IPX5 splash resistant. Black or ivory. One year warranty.",
    category: "Audio" },
  { name: "AuraBuds Lite wireless earbuds", price: 18900, stock: 40,
    description: "Entry-level wireless earbuds, 18 hours total battery, USB-C, no noise cancelling. Black only. One year warranty.",
    category: "Audio" },
  { name: "NurCharge 20000mAh power bank", price: 14500, stock: 12,
    description: "20000mAh power bank with 22.5W fast charge, two USB-A ports and one USB-C. Charges a phone roughly four times. Airline safe.",
    category: "Power" },
  { name: "SteelFrame phone stand", price: 6900, stock: 2,
    description: "Aluminium desk stand, adjustable angle, fits phones and tablets up to 11 inches. Silver or space grey.",
    category: "Accessories" },
];

for (const prod of products) {
  const text = `${prod.name} — ${prod.description} — category: ${prod.category} — price ${prod.price} KZT`;
  const row = { ...prod, user_id: USER, currency: "kzt", active: true, track_stock: true,
                low_stock_at: 3, embedding: await embed(text) };
  const [found] = await rest(`products?select=id&user_id=eq.${USER}&name=eq.${encodeURIComponent(prod.name)}`);
  if (found) await rest(`products?id=eq.${found.id}`, { method: "PATCH", body: JSON.stringify(row) });
  else await rest("products", { method: "POST", body: JSON.stringify(row) });
  console.log(`· product: ${prod.name} (${prod.stock} in stock)`);
}

const entries = [
  { type: "faq", title: "How long does delivery take?",
    content: "Almaty and Astana: next day. Other cities in Kazakhstan: two to four working days via Kazpost. Delivery is free on orders over 25000 KZT, otherwise 1500 KZT.",
    keywords: "delivery, dostavka, shipping, how long, free delivery",
    priority: 10, metadata: { category: "Delivery" } },
  { type: "faq", title: "How can I pay?",
    content: "Cash on delivery, or Kaspi transfer before dispatch. We do not take card details over chat.",
    keywords: "payment, oplata, kaspi, cash, card",
    priority: 10, metadata: { category: "Payment" } },
  { type: "policy", title: "Returns and warranty",
    content: "Fourteen days to return an unopened item for a full refund. Twelve month warranty on all AuraBuds and NurCharge products covering manufacturing faults. Water damage is not covered.",
    keywords: "return, refund, warranty, garantiya, vozvrat",
    priority: 10, metadata: {} },
  { type: "flow", title: "Taking an order",
    content: "Confirm the exact item and quantity, then the colour if the item has options, then collect a name and a phone number, then state the total including delivery.",
    keywords: "order, checkout, buy, zakaz",
    priority: 6, metadata: { steps: ["Confirm item and quantity", "Confirm colour", "Collect name and phone", "State the total"] } },
];

for (const e of entries) {
  const text = [e.title, e.content, `Keywords: ${e.keywords}`, `Type: ${e.type}`,
    e.metadata?.price ? `Price: ${e.metadata.price}` : null,
    e.metadata?.currency ? `Currency: ${e.metadata.currency}` : null,
  ].filter(Boolean).join(" — ");

  const row = { ...e, user_id: USER, persona_id: null, active: true, embedding: await embed(text) };
  const [found] = await rest(
    `knowledge_entries?select=id&user_id=eq.${USER}&title=eq.${encodeURIComponent(e.title)}`,
  );
  if (found) {
    await rest(`knowledge_entries?id=eq.${found.id}`, { method: "PATCH", body: JSON.stringify(row) });
  } else {
    await rest("knowledge_entries", { method: "POST", body: JSON.stringify(row) });
  }
  console.log(`· ${e.type}: ${e.title}`);
}

/* ── web channel ── */
const publicKey = `sg_live_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
const [existingChannel] = await rest(
  `channels?select=id,public_key&user_id=eq.${USER}&type=eq.web`,
);
let key;
if (existingChannel) {
  key = existingChannel.public_key;
  await rest(`channels?id=eq.${existingChannel.id}`, {
    method: "PATCH", body: JSON.stringify({ persona_id: personaId, is_active: true }),
  });
  console.log("· web channel reused");
} else {
  const [c] = await rest("channels", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: USER, persona_id: personaId, type: "web", name: "Website widget",
      public_key: publicKey, config: { title: "TechNur", accent: "#00d26a" },
    }),
  });
  key = c.public_key;
  console.log("· web channel created");
}

console.log(`\npersona_id : ${personaId}`);
console.log(`public_key : ${key}`);
