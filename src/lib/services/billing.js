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

import { creditsFor, creditsToUsd, LOW_BALANCE } from "@/lib/ai/pricing";

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
  supabase,
  userId,
  { model, inputTokens = 0, outputTokens = 0, kind = "chat", conversationId = null, channel = null },
) {
  const credits = creditsFor({ model, inputTokens, outputTokens });

  const { data: event, error } = await supabase
    .from("usage_events")
    .insert({
      user_id: userId,
      conversation_id: conversationId,
      channel,
      kind,
      model,
      input_tokens: Math.max(0, Math.round(inputTokens)),
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

/** Put credits in. Top-ups, welcome grants, goodwill. */
export async function addCredits(supabase, userId, amount, { reason = "topup", note } = {}) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Amount must be positive.");

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

  const [balance, events, transactions] = await Promise.all([
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
    lowBalance: balance < LOW_BALANCE,
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
