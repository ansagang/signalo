/**
 * Unit tests for the widget's colour engine.
 *
 * Every case here is a panel a seller could produce with the colour pickers
 * they already have. The point of the engine is that none of them can end up
 * unreadable, so that is what these assert.
 *
 *   node scripts/test-widget-theme.mjs
 */
import { panelTheme, contrast, inkOn, mix } from "../src/lib/widget-theme.js";

let pass = 0, fail = 0;
const ok = (name, condition, detail) => {
  condition ? pass++ : fail++;
  console.log(`${condition ? "✓" : "✗"} ${name}`);
  if (!condition && detail) console.log(`    ${detail}`);
};

const readable = (name, config) => {
  const t = panelTheme(config);
  ok(`${name}: body text is readable`, contrast(t.fg, t.bg) >= 7,
     `got ${contrast(t.fg, t.bg).toFixed(2)}:1 for ${t.fg} on ${t.bg}`);
  ok(`${name}: bubbles are distinguishable from the panel`, contrast(t.surface, t.bg) > 1.02,
     `surface ${t.surface} vs bg ${t.bg}`);
  // 4.5:1 is the readable minimum for body text; the panel's own text is held
  // to the stricter 7:1 above, but a bubble fill is the seller's colour and
  // shifting its hue to chase 7 would no longer be their brand.
  ok(`${name}: text on the accent is readable`, contrast(t.accentInk, t.accent) >= 4.5,
     `got ${contrast(t.accentInk, t.accent).toFixed(2)}:1 for ${t.accentInk} on ${t.accent}`);
  ok(`${name}: the accent is visible against the panel`, contrast(t.accentOnPanel, t.bg) >= 3,
     `got ${contrast(t.accentOnPanel, t.bg).toFixed(2)}:1`);
  return t;
};

readable("defaults", {});
readable("light theme", { theme: "light" });
readable("brand silver", { theme: "dark", accent: "#c9ced6" });
readable("near-black accent on a dark panel", { theme: "dark", accent: "#0b0b0d" });
readable("white accent on a white panel", { theme: "light", accent: "#ffffff" });
readable("text set to the background colour", { theme: "dark", panelBg: "#101014", panelText: "#101014" });
readable("a seller's navy", { theme: "dark", panelBg: "#0b1622", accent: "#0090ff" });
readable("sand", { theme: "light", panelBg: "#fdfaf6", panelText: "#231a12", accent: "#ff6a00" });

const junk = panelTheme({ theme: "dark", accent: "not-a-colour", panelBg: "rgb(1,2,3)" });
ok("junk values fall back instead of throwing", junk.bg === "#0a0a0c" && junk.accent === "#c9ced6");

const kept = panelTheme({ theme: "dark", accent: "#0090ff" });
ok("a readable accent is left exactly as chosen", kept.accent === "#0090ff");

const surfaced = panelTheme({ theme: "dark", panelSurface: "#223344" });
ok("an explicit surface is honoured", surfaced.surface === "#223344");

ok("ink flips on a light accent", inkOn("#ffffff") === "#0a0a0c");
ok("a mid blue takes dark ink, not white", inkOn("#0090ff") === "#0a0a0c");
ok("a mid orange takes dark ink, not white", inkOn("#ff6a00") === "#0a0a0c");
ok("ink flips on a dark accent", inkOn("#101014") === "#ffffff");
ok("mixing all the way lands on the target", mix("#000000", "#ffffff", 1) === "#ffffff");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
