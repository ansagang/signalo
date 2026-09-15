/**
 * The business's timezone.
 *
 * Every opening hour, slot and displayed time resolves against this. It lives
 * on the profile, so anything acting on a seller's behalf — a dashboard page,
 * a webhook, the assistant — has to look it up rather than assume.
 */
export const DEFAULT_TZ = "Asia/Almaty";

/** Zones offered in the picker. Anything else can still be set directly. */
export const COMMON_TIMEZONES = [
  "Asia/Almaty", "Asia/Aqtobe", "Asia/Atyrau", "Asia/Oral", "Asia/Aqtau",
  "Asia/Tashkent", "Asia/Bishkek", "Asia/Dushanbe", "Asia/Ashgabat",
  "Europe/Moscow", "Europe/Kyiv", "Europe/Minsk", "Europe/Istanbul",
  "Europe/London", "Europe/Berlin", "Europe/Warsaw", "Europe/Lisbon",
  "Asia/Dubai", "Asia/Tbilisi", "Asia/Yerevan", "Asia/Baku",
  "Asia/Novosibirsk", "Asia/Yekaterinburg", "Asia/Omsk",
  "Asia/Seoul", "Asia/Shanghai", "Asia/Singapore", "Asia/Tokyo",
  "America/New_York", "America/Chicago", "America/Los_Angeles",
];

/** Fall back rather than let an empty column break every date on the page. */
export function tzOf(profile) {
  return profile?.timezone || DEFAULT_TZ;
}

/** Read the owning seller's zone. Used by webhooks, which have no session. */
export async function tzForUser(supabase, userId) {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .maybeSingle();
    return data?.timezone || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

/** "Asia/Almaty" → "Asia / Almaty (GMT+5)", for the picker. */
export function tzLabel(zone, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone, timeZoneName: "shortOffset",
    }).formatToParts(now);
    const offset = parts.find((x) => x.type === "timeZoneName")?.value || "";
    return `${zone.replace("_", " ").replace("/", " / ")} (${offset})`;
  } catch {
    return zone;
  }
}
