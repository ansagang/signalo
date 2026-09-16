/**
 * Roll every subscription that has reached the end of its period.
 *
 * Expires the unused part of the old allowance and grants the new one. Safe to
 * run as often as you like — startPeriod only grants once per period, so a
 * double-run cannot hand out free credits.
 *
 *   node scripts/renew-subscriptions.mjs
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

const now = new Date().toISOString();
const enc = encodeURIComponent;

const due = await rest(
  `subscriptions?select=*,plans(*)&status=neq.cancelled&current_period_end=lt.${enc(now)}`,
);

if (!due.length) {
  console.log("nothing due");
  process.exit(0);
}

for (const sub of due) {
  if (sub.cancel_at_period_end) {
    await rest(`subscriptions?user_id=eq.${sub.user_id}`, {
      method: "PATCH", body: JSON.stringify({ status: "cancelled", updated_at: now }),
    });
    console.log(`· ${sub.user_id}: cancelled as requested`);
    continue;
  }

  const from = new Date(sub.current_period_end);
  const to = new Date(from); to.setMonth(to.getMonth() + 1);

  // Only the unused part of the old allowance is written off.
  const rows = await rest(
    `credit_transactions?select=delta,reason&user_id=eq.${sub.user_id}` +
    `&created_at=gte.${enc(sub.current_period_start)}&created_at=lt.${enc(sub.current_period_end)}`,
  );
  let granted = 0, used = 0;
  for (const r of rows) {
    const v = Number(r.delta);
    if (r.reason === "subscription") granted += v;
    else if (r.reason === "usage") used += -v;
  }
  const unused = Math.max(0, granted - used);

  if (unused > 0) {
    await rest("credit_transactions", {
      method: "POST",
      body: JSON.stringify({
        user_id: sub.user_id, delta: -unused, reason: "expiry",
        note: `Unused ${sub.plan_key} allowance`,
      }),
    });
  }

  await rest("credit_transactions", {
    method: "POST",
    body: JSON.stringify({
      user_id: sub.user_id, delta: sub.plans.credits, reason: "subscription",
      note: `${sub.plans.name} monthly allowance`,
    }),
  });

  await rest(`subscriptions?user_id=eq.${sub.user_id}`, {
    method: "PATCH",
    body: JSON.stringify({
      current_period_start: from.toISOString(),
      current_period_end: to.toISOString(),
      updated_at: now,
    }),
  });

  console.log(`· ${sub.user_id}: expired ${unused}, granted ${sub.plans.credits} (${sub.plan_key})`);
}
