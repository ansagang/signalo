/**
 * Usage, credits and the bill.
 *
 * The balance is the sum of an append-only ledger rather than a stored total,
 * so recording usage is two plain inserts and nothing has to be locked.
 *
 * PostgREST refuses aggregate selects on this project, so the summing happens
 * here. That is fine at the volumes involved — one row per assistant reply —
 * and it keeps the money logic in code where it can be read and tested. If a
 * seller ever reaches a size where paging the ledger is slow, the fix is a
 * periodic checkpoint row, not moving this back into the database.
 */

import { creditsFor, creditsToUsd, LOW_BALANCE, WELCOME_CREDITS } from "@/lib/ai/pricing";
import { createServiceClient } from "@/lib/supabase/service";

const PAGE = 1000;

/** Every row of a table for one seller, a page at a time. */
async function allRows(supabase, table, columns, userId, extra = (q) => q) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await extra(
      supabase.from(table).select(columns).eq("user_id", userId),
    ).range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

/** What this seller has left. */
export async function creditBalance(supabase, userId) {
  const rows = await allRows(supabase, "credit_transactions", "delta", userId);
  const balance = rows.reduce((sum, r) => sum + Number(r.delta), 0);
  return Math.round(balance * 10000) / 10000;
}

/**
 * Write down one billable call.
 *
 * Two inserts, no lock: appending never races. The usage row is the fact, the
 * transaction is its effect on the balance.
 */
export async function recordUsage(
  _supabase,
  userId,
  { model, inputTokens = 0, outputTokens = 0, cacheWriteTokens = 0, cacheReadTokens = 0,
    kind = "chat", conversationId = null, channel = null },
) {
  const credits = creditsFor({ model, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens });

  // The ledger is append-only and readable by its owner, never writable by
  // them — the policies grant SELECT and nothing else. A caller holding a
  // session client (the playground, the setup wizard) would have its insert
  // silently refused, so writes always go through the service role.
  const supabase = createServiceClient();

  const { data: event, error } = await supabase
    .from("usage_events")
    .insert({
      user_id: userId,
      conversation_id: conversationId,
      channel,
      kind,
      model,
      // Recorded together so the seller sees the size of a conversation, not
      // an accounting split they did not ask about.
      input_tokens: Math.max(0, Math.round(inputTokens + cacheWriteTokens + cacheReadTokens)),
      output_tokens: Math.max(0, Math.round(outputTokens)),
      credits,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (credits > 0) {
    const { error: txError } = await supabase.from("credit_transactions").insert({
      user_id: userId,
      delta: -credits,
      reason: "usage",
      usage_event_id: event.id,
    });
    if (txError) throw txError;
  }

  return { credits, eventId: event.id };
}

/**
 * Give a new account its welcome balance, once.
 *
 * Idempotent: an account that has any ledger row at all has already been
 * granted, so calling this again is a no-op. Safe to call from signup, from
 * the admin script, or from a backfill.
 */
export async function ensureWelcomeGrant(supabase, userId, amount = WELCOME_CREDITS) {
  const { data, error } = await supabase
    .from("credit_transactions")
    .select("id")
    .eq("user_id", userId)
    .limit(1);
  if (error) throw error;
  if (data?.length) return { granted: false };

  await addCredits(null, userId, amount, { reason: "grant", note: "Welcome balance" });
  return { granted: true, amount };
}

/** Put credits in. Top-ups, welcome grants, goodwill. */
export async function addCredits(_supabase, userId, amount, { reason = "topup", note } = {}) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Amount must be positive.");

  const supabase = createServiceClient();
  const { error } = await supabase.from("credit_transactions").insert({
    user_id: userId,
    delta: value,
    reason,
    note: note || null,
  });
  if (error) throw error;

  return creditBalance(supabase, userId);
}

/**
 * Everything the billing page shows, for one window.
 *
 * Grouped here rather than in SQL so the shapes stay obvious and the page
 * stays a dumb renderer.
 */
export async function billingOverview(supabase, userId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const [balance, events, transactions, plans, subscription] = await Promise.all([
    creditBalance(supabase, userId),
    allRows(
      supabase, "usage_events",
      "id, created_at, channel, kind, model, input_tokens, output_tokens, credits",
      userId,
      (q) => q.gte("created_at", since).order("created_at", { ascending: false }),
    ),
    supabase
      .from("credit_transactions")
      .select("id, created_at, delta, reason, note")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => data || []),
    listPlans(supabase),
    currentSubscription(supabase, userId),
  ]);

  const spent = events.reduce((sum, e) => sum + Number(e.credits), 0);
  const inTokens = events.reduce((sum, e) => sum + e.input_tokens, 0);
  const outTokens = events.reduce((sum, e) => sum + e.output_tokens, 0);

  const bucket = (rows, key) => {
    const map = new Map();
    for (const e of rows) {
      const k = e[key] || "—";
      const at = map.get(k) || { key: k, credits: 0, calls: 0 };
      at.credits += Number(e.credits);
      at.calls += 1;
      map.set(k, at);
    }
    return [...map.values()]
      .map((x) => ({ ...x, credits: Math.round(x.credits * 100) / 100 }))
      .sort((a, b) => b.credits - a.credits);
  };

  // One entry per day so the chart has no gaps to explain away.
  const perDay = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    perDay.push({ day: d, credits: 0, calls: 0 });
  }
  const byDay = new Map(perDay.map((d) => [d.day, d]));
  for (const e of events) {
    const slot = byDay.get(String(e.created_at).slice(0, 10));
    if (slot) { slot.credits += Number(e.credits); slot.calls += 1; }
  }
  for (const d of perDay) d.credits = Math.round(d.credits * 100) / 100;

  // A run rate from the days that actually happened, not the empty ones.
  const active = perDay.filter((d) => d.calls > 0);
  const perDayAvg = active.length ? spent / active.length : 0;

  return {
    balance,
    plans,
    subscription,
    lowBalance: balance < LOW_BALANCE,
    outOfCredits: balance <= 0,
    money: creditsToUsd(balance),
    days,
    spent: Math.round(spent * 100) / 100,
    calls: events.length,
    inputTokens: inTokens,
    outputTokens: outTokens,
    byChannel: bucket(events, "channel"),
    byModel: bucket(events, "model"),
    perDay,
    // Rough, and labelled as such in the UI.
    daysLeft: perDayAvg > 0 ? Math.floor(balance / perDayAvg) : null,
    recent: events.slice(0, 20),
    transactions,
  };
}

/* ─────────────────────────── plans & subscriptions ────────────────────── */

export async function listPlans(supabase) {
  const { data, error } = await supabase
    .from("plans").select("*").eq("active", true).order("sort");
  if (error) throw error;
  return data || [];
}

/** The seller's subscription, with the plan attached. */
export async function currentSubscription(supabase, userId) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*, plans(*)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Credits granted, and usage taken, inside one window. */
async function periodTotals(supabase, userId, from, to) {
  const { data, error } = await supabase
    .from("credit_transactions")
    .select("delta, reason")
    .eq("user_id", userId)
    .gte("created_at", from)
    .lt("created_at", to);
  if (error) throw error;

  let granted = 0, used = 0;
  for (const row of data || []) {
    const value = Number(row.delta);
    if (row.reason === "subscription") granted += value;
    else if (row.reason === "usage") used += -value;
  }
  return { granted, used };
}

/**
 * Start a period: write off what the last allowance did not use, then grant
 * the new one.
 *
 * Idempotent per period — calling it twice inside the same window grants once,
 * so a retried webhook or a double-run cron cannot hand out free credits.
 */
export async function startPeriod(supabase, userId, plan, { from, to }) {
  const { data: already } = await supabase
    .from("credit_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("reason", "subscription")
    .gte("created_at", from)
    .limit(1);
  if (already?.length) return { granted: false };

  const sub = await currentSubscription(supabase, userId);
  if (sub) {
    // Only the unused part of the old allowance expires. Anything spent has
    // already left the balance, and overage came out of paid-for packs.
    const { granted, used } = await periodTotals(
      supabase, userId, sub.current_period_start, sub.current_period_end,
    );
    const unused = Math.max(0, granted - used);
    if (unused > 0) {
      await supabase.from("credit_transactions").insert({
        user_id: userId,
        delta: -unused,
        reason: "expiry",
        note: `Unused ${sub.plan_key} allowance`,
      });
    }
  }

  await supabase.from("credit_transactions").insert({
    user_id: userId,
    delta: plan.credits,
    reason: "subscription",
    note: `${plan.name} monthly allowance`,
  });

  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      plan_key: plan.key,
      status: "active",
      current_period_start: from,
      current_period_end: to,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return { granted: true, credits: plan.credits };
}

/** One month from `at`, which is what every plan bills on. */
export function nextPeriod(at = new Date()) {
  const from = new Date(at);
  const to = new Date(at);
  to.setMonth(to.getMonth() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * Put a seller on a plan.
 *
 * Called by a payment webhook once money has actually moved. Nothing here
 * takes payment — this is the ledger half.
 */
export async function activatePlan(supabase, userId, planKey, { provider, providerRef } = {}) {
  const { data: plan, error } = await supabase
    .from("plans").select("*").eq("key", planKey).maybeSingle();
  if (error) throw error;
  if (!plan) throw new Error(`No such plan: ${planKey}`);

  const period = nextPeriod();
  const result = await startPeriod(supabase, userId, plan, period);

  if (provider || providerRef) {
    await supabase
      .from("subscriptions")
      .update({ provider: provider || null, provider_ref: providerRef || null })
      .eq("user_id", userId);
  }

  return { plan, ...result };
}

/**
 * Whether the assistant may answer.
 *
 * A seller out of credits should not have their customers ignored, so the
 * caller hands the conversation to a human instead — the same path a
 * complaint takes. Silence is what loses the customer, not the bill.
 */
export async function canSpend(supabase, userId) {
  const balance = await creditBalance(supabase, userId);
  return { ok: balance > 0, balance };
}
