/**
 * Unit tests for which language the widget speaks.
 *
 * The order of evidence is the whole design, so it is what these assert. Each
 * case is a visitor who could actually turn up on a seller's site.
 *
 *   node scripts/test-widget-language.mjs
 */
import { resolveWidgetLocale, resolveLauncherLabel, fill } from "../src/lib/widget-language.js";

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) console.log(`    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`);
};

/* ── the order of evidence ── */

t("what the host page asks for wins over everything",
  resolveWidgetLocale({ requested: "kk", pinned: "en", cookieLocale: "ru", acceptLanguage: "en-GB" }), "kk");

t("a pinned language wins over the visitor's own signals",
  resolveWidgetLocale({ pinned: "en", cookieLocale: "ru", acceptLanguage: "kk-KZ", sellerLocale: "ru" }), "en");

t("a request for a language we do not speak falls through",
  resolveWidgetLocale({ requested: "fr", cookieLocale: "kk" }), "kk");

t("no request at all changes nothing",
  resolveWidgetLocale({ requested: "", pinned: "auto", acceptLanguage: "ru-RU" }), "ru");

t("the cookie beats the browser header",
  resolveWidgetLocale({ pinned: "auto", cookieLocale: "kk", acceptLanguage: "ru-RU,ru;q=0.9" }), "kk");

t("the header is used when there is no cookie",
  resolveWidgetLocale({ pinned: "auto", acceptLanguage: "ru-RU,ru;q=0.9,en;q=0.8" }), "ru");

t("a second-choice language beats falling through to English",
  resolveWidgetLocale({ acceptLanguage: "de-DE,de;q=0.9,kk;q=0.8" }), "kk");

t("the seller's own language is the last guess",
  resolveWidgetLocale({ acceptLanguage: "de-DE,fr;q=0.8", sellerLocale: "kk" }), "kk");

t("English when nothing is known", resolveWidgetLocale({}), "en");

/* ── values we do not control ── */

t("a cookie holding a language we do not speak is ignored",
  resolveWidgetLocale({ cookieLocale: "fr", acceptLanguage: "ru-RU" }), "ru");

t("'auto' is not a language", resolveWidgetLocale({ pinned: "auto", acceptLanguage: "kk-KZ" }), "kk");

t("a junk pin falls through rather than pinning junk",
  resolveWidgetLocale({ pinned: "klingon", acceptLanguage: "ru-RU" }), "ru");

t("a region-only header still resolves", resolveWidgetLocale({ acceptLanguage: "RU" }), "ru");

t("whitespace and quality values do not confuse it",
  resolveWidgetLocale({ acceptLanguage: "  en-GB ; q=0.7 ,  kk ; q=0.9 " }), "en");

/* ── launcher labels ── */

const words = { labels: { help: "Нужна помощь?", chat: "Напишите нам" } };
t("a preset becomes the visitor's language", resolveLauncherLabel("preset:help", words), "Нужна помощь?");
t("a hand-written label is left alone", resolveLauncherLabel("Сәлем!", words), "Сәлем!");
t("no label stays no label", resolveLauncherLabel("", words), "");
t("an unknown preset shows nothing rather than its key",
  resolveLauncherLabel("preset:nonsense", words), "");

/* ── templates ── */

t("blanks are filled", fill("Order — {total} {currency}", { total: "12 000", currency: "KZT" }),
  "Order — 12 000 KZT");
t("an unknown blank is left visible rather than blanked",
  fill("Hello {who}", {}), "Hello {who}");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
