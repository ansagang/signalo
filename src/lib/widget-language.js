/**
 * Which language the widget itself speaks.
 *
 * Two different languages meet on a seller's site. The assistant already
 * matches whatever the customer writes — that is the persona's `language`
 * setting. This is about the chrome around it: the placeholder, the "order
 * recorded" notice, the close button. Those are the widget's own words, and
 * showing them in English to a Russian-speaking visitor on a Kazakh salon's
 * site is exactly the seam this closes.
 *
 * The seller can pin one, and "auto" follows the visitor's own browser. That
 * order matters: a seller who serves one language wants it pinned, and a
 * seller who serves several wants each visitor answered in theirs.
 */

import { languages_codes } from "../config/languages.js";

const PACKS = {
  en: () => import("../config/lang/en.json").then((m) => m.default.widget),
  ru: () => import("../config/lang/ru.json").then((m) => m.default.widget),
  kk: () => import("../config/lang/kk.json").then((m) => m.default.widget),
};

/**
 * Pick a locale from what we know, best evidence first.
 *
 * 1. What the host page asked for, live — `data-lang` on the script tag, or
 *    `Signalo.setLanguage(...)`. A site with its own language switcher knows
 *    which language this visitor is reading *right now*, which no stored
 *    setting can keep up with.
 * 2. What the seller pinned for the channel. An explicit choice is not a guess.
 * 3. The `lang` cookie. Someone who has switched language on this site has
 *    said what they want in as many words, which beats what their browser was
 *    installed with — a phone bought abroad reports the shop's language, not
 *    its owner's.
 * 4. `Accept-Language`, the raw header ("ru-RU,ru;q=0.9,en;q=0.8"). Every
 *    entry is read in the order the browser ranked them, so a visitor whose
 *    first choice we cannot speak still gets their second rather than English.
 * 5. The seller's own language, then English.
 */
export function resolveWidgetLocale({ requested, pinned, cookieLocale, acceptLanguage, sellerLocale } = {}) {
  if (languages_codes.includes(requested)) return requested;
  if (pinned && pinned !== "auto" && languages_codes.includes(pinned)) return pinned;
  if (languages_codes.includes(cookieLocale)) return cookieLocale;

  for (const part of String(acceptLanguage || "").split(",")) {
    const tag = part.split(";")[0].trim().split("-")[0].toLowerCase();
    if (languages_codes.includes(tag)) return tag;
  }

  if (languages_codes.includes(sellerLocale)) return sellerLocale;
  return "en";
}

/** The widget's own strings for a locale, with English as the floor. */
export async function widgetStrings(locale) {
  const load = PACKS[locale] || PACKS.en;
  return load();
}

/** The preset launcher labels a seller can pick instead of writing their own. */
export const LABEL_PRESETS = ["chat", "help", "ask", "message", "book", "price"];

/**
 * The words on the launcher, in the visitor's language.
 *
 * A seller who types "Напишите нам" gets exactly that, forever, in front of
 * every visitor — which is right for a business that serves one language and
 * wrong for one that does not. So the field holds either a literal string or
 * `preset:<key>`, and a preset is translated per visitor the same way the rest
 * of the chrome is.
 */
export function resolveLauncherLabel(value, strings) {
  const raw = String(value || "");
  if (!raw.startsWith("preset:")) return raw;

  const key = raw.slice("preset:".length);
  return strings?.labels?.[key] || "";
}

/** "Order recorded — {total} {currency}" with the blanks filled in. */
export function fill(template, values = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (whole, key) =>
    values[key] === undefined ? whole : String(values[key]),
  );
}

/**
 * The strings a channel should fall back to when there is no reply to send.
 *
 * Telegram tells us the customer's own language; WhatsApp, Instagram and email
 * do not, so the seller's own is the best available guess. Either way it beats
 * the bilingual "Извините… / Sorry…" line these used to send, which was wrong
 * for everyone at once.
 */
export async function channelStrings(supabase, userId, customerLocale) {
  let sellerLocale = null;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("lang")
      .eq("id", userId)
      .maybeSingle();
    sellerLocale = data?.lang || null;
  } catch {
    // A missing profile is never worth failing a customer's message over.
  }

  return widgetStrings(
    resolveWidgetLocale({ acceptLanguage: customerLocale, sellerLocale }),
  );
}
