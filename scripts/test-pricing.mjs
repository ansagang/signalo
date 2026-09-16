/**
 * What we charge, pinned. A pricing change should break these on purpose.
 *
 *   node scripts/test-pricing.mjs
 */
import { creditsFor, costUsd, creditsToUsd, MARGIN } from "../src/lib/ai/pricing.js";

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) console.log(`    got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
};

// Opus: 1M in at $15, 1M out at $75.
t("opus provider cost", costUsd({ model: "claude-opus-5", inputTokens: 1e6, outputTokens: 0 }), 15);
t("opus charged at the margin",
  creditsFor({ model: "claude-opus-5", inputTokens: 1e6, outputTokens: 0 }), 15 * MARGIN * 100);

// A realistic reply: ~4k in (prompt + catalogue), ~300 out.
const one = creditsFor({ model: "claude-opus-5", inputTokens: 4000, outputTokens: 300 });
t("a typical opus reply is a few credits", one > 1 && one < 30, true);
const haiku = creditsFor({ model: "claude-haiku-4-5", inputTokens: 4000, outputTokens: 300 });
t("haiku is much cheaper than opus", haiku < one / 5, true);

t("tiny calls never round to free",
  creditsFor({ model: "claude-haiku-4-5", inputTokens: 1, outputTokens: 1 }) > 0, true);
t("an unknown model is not free",
  creditsFor({ model: "some-new-model", inputTokens: 1e6, outputTokens: 0 }) > 0, true);
t("zero tokens cost zero",
  creditsFor({ model: "claude-opus-5", inputTokens: 0, outputTokens: 0 }), 0);
t("credits read back as money", creditsToUsd(500), 5);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
