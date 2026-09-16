/**
 * What a reply costs.
 *
 * Rates change whenever a provider moves its prices, so they live here rather
 * than in a migration: editable, testable, and shipped with the code that
 * uses them.
 *
 * A credit is one US cent of billed usage. Billed, not raw — the platform
 * pays the provider and charges a multiple of it, which is the margin below.
 */

/** Provider list price, US dollars per million tokens. */
export const RATES = {
  "claude-opus-5":    { input: 15, output: 75 },
  "claude-sonnet-5":  { input: 3,  output: 15 },
  "claude-haiku-4-5": { input: 1,  output: 5 },
  "gpt-4o":           { input: 2.5, output: 10 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
};

/** Charged over provider cost. Covers hosting, storage and the platform. */
export const MARGIN = 2;

/** 1 credit = $0.01, so a balance reads like money without being money. */
export const CREDITS_PER_USD = 100;

/** An unknown model bills at the priciest known rate rather than for free. */
const FALLBACK = { input: 15, output: 75 };

export function rateFor(model) {
  return RATES[model] || FALLBACK;
}

/** Provider cost of one call, in US dollars. */
export function costUsd({ model, inputTokens = 0, outputTokens = 0 }) {
  const rate = rateFor(model);
  return ((inputTokens * rate.input) + (outputTokens * rate.output)) / 1_000_000;
}

/**
 * Credits to charge for one call.
 *
 * Rounded up to the nearest hundredth of a credit so a long conversation of
 * tiny replies cannot round its way to free.
 */
export function creditsFor({ model, inputTokens = 0, outputTokens = 0 }) {
  const billed = costUsd({ model, inputTokens, outputTokens }) * MARGIN * CREDITS_PER_USD;
  return Math.ceil(billed * 100) / 100;
}

/** Credits as an amount of money, for showing next to the balance. */
export function creditsToUsd(credits) {
  return (Number(credits) || 0) / CREDITS_PER_USD;
}

/** Below this, the dashboard starts warning. */
export const LOW_BALANCE = 250;
