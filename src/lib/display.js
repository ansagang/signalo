import { DEFAULT_TZ } from "@/lib/timezone";
/**
 * Presentation helpers shared across the dashboard.
 */

/**
 * A name a human can actually read.
 *
 * Conversations opened from the widget have no name until the customer gives
 * one, and their identifier is the raw session id — showing that verbatim
 * filled the inbox with strings like
 * "webchat:658b5a4d-…:6db51eb0-f773-…". Fall back to a short, stable label.
 */
export function customerLabel(conversation, t) {
  if (!conversation) return "";

  const { customer_name: name, customer_identifier: id, phone, channel } = conversation;
  if (name?.trim()) return name.trim();
  if (id?.startsWith("@")) return id;            // telegram handle
  if (phone?.trim()) return phone.trim();

  const visitor = t?.visitor || "Visitor";
  if (!id) return visitor;

  // Session ids look like "<channel>:<persona>:<uuid>" — the tail is the only
  // part that distinguishes one visitor from another.
  const tail = id.split(":").pop() || id;
  return `${visitor} ${tail.slice(0, 4)}`;
}

export function initialsFor(conversation, t) {
  const label = customerLabel(conversation, t);
  const named = conversation?.customer_name?.trim();

  if (named) {
    return named
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }
  if (label.startsWith("@")) return label.slice(1, 3).toUpperCase();
  // Anonymous visitors get the id fragment, which at least stays stable.
  return label.split(" ").pop().slice(0, 2).toUpperCase();
}

const MONEY = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function money(amount, currency) {
  const n = Number(amount || 0);
  return `${MONEY.format(n)} ${String(currency || "kzt").toUpperCase()}`;
}

/** "Today 14:30" / "Tue 16 Sep" — never a bare 9/14/2026. */
export function friendlyDate(iso, locale = "en-GB", timeZone = DEFAULT_TZ) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();

  const day = (x) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit" }).format(d);

  if (day(d) === day(now)) return time;

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (day(d) === day(tomorrow)) return `Tomorrow ${time}`;

  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "short",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(d);
}

export function relativeTime(iso, t) {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t?.justNow || "now";
  if (mins < 60) return `${mins}${t?.minutesShort || "m"}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}${t?.hoursShort || "h"}`;
  return `${Math.round(hours / 24)}${t?.daysShort || "d"}`;
}

export function timeOnly(iso, timeZone = DEFAULT_TZ) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
