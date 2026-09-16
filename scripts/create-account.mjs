/**
 * Create a bare account — a login and nothing else.
 *
 * No products, services, people, personas or channels: the state a real
 * seller starts from, which is the only way to see what the empty app
 * actually feels like.
 *
 *   node scripts/create-account.mjs <email> [password] [business name]
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

const email = process.argv[2];
const password = process.argv[3] || "SignaloNew2026!";
const name = process.argv[4] || "My business";

if (!email) {
  console.error("usage: node scripts/create-account.mjs <email> [password] [business name]");
  process.exit(1);
}

const rest = async (p, init = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${p} → ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
};

const [existing] = await rest(`profiles?select=id&email=eq.${encodeURIComponent(email)}`);
if (existing) {
  console.log(`${email} already exists (${existing.id}) — nothing created.`);
  process.exit(0);
}

const res = await fetch(`${U}/auth/v1/admin/users`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    email, password, email_confirm: true, user_metadata: { full_name: name },
  }),
});
const body = await res.json();
if (!res.ok) throw new Error(`create user → ${res.status} ${JSON.stringify(body)}`);

// A profile row may be created by a trigger; make sure of it either way.
const [profile] = await rest(`profiles?select=id&id=eq.${body.id}`);
if (!profile) {
  await rest("profiles", {
    method: "POST",
    body: JSON.stringify({ id: body.id, email, full_name: name, lang: "en", role: "user" }),
  });
} else {
  await rest(`profiles?id=eq.${body.id}`, {
    method: "PATCH", body: JSON.stringify({ full_name: name, email }),
  });
}

console.log(`created  ${email} / ${password}`);
console.log(`user_id  ${body.id}`);
console.log("empty: no catalogue, no people, no personas, no channels.");
