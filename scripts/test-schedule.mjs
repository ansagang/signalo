/**
 * Unit tests for the booking rules.
 *
 * These used to live in a Postgres function where nothing could run them.
 * Every case below is a bug that actually shipped, or a rule a customer felt.
 *
 *   node scripts/test-schedule.mjs
 */
import { freeSlots, checkSlot, atLocal, localTime } from "../src/lib/booking/schedule.js";

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) console.log(`    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`);
};

const TZ = "Europe/Berlin";
const DAY = "2026-09-17";                     // a Thursday
const PAST = new Date("2026-09-01T00:00:00Z"); // so lead time never bites

const shop = [{ weekday: 4, opens: "09:00:00", closes: "19:00:00", closed: false }];
const closedThu = [{ weekday: 4, opens: "09:00:00", closes: "19:00:00", closed: true }];

const haircut = {
  id: "svc", active: true, duration_min: 45, buffer_min: 10,
  slot_mode: "grid", slot_step_min: 45, slot_times: [], lead_time_min: 0,
  capacity: 1, booking_mode: "appointment", min_party: 1, max_party: 1,
};
const gleb = { id: "gleb", name: "Глеб", active: true };
const glebShift = [{ resource_id: "gleb", weekday: 4, starts_at: "10:00:00", ends_at: "19:00:00", off: false }];

const base = {
  service: haircut, day: DAY, timezone: TZ,
  businessHours: shop, resources: [gleb], resourceHours: glebShift,
  appointments: [], now: PAST,
};
const times = (input) => freeSlots(input).map((s) => localTime(s.slot_start, TZ));

/* ── the bug that started this: offer and check disagreed ── */
const offered = freeSlots(base);
t("shop opens 09:00, shift starts 10:00 → grid counts from the shift",
  times(base).slice(0, 4), ["10:00", "10:45", "11:30", "12:15"]);

const refused = offered.filter(
  (s) => !checkSlot({ ...base, startsAt: s.slot_start }).ok,
);
t("every offered time is bookable (regression: 10 of 10 were refused)", refused.length, 0);

/* ── refusal reasons must be the truth ── */
t("off-grid minute is off_grid, not 'taken'",
  checkSlot({ ...base, startsAt: atLocal(DAY, "13:07", TZ) }).reason, "off_grid");
t("before the shift is outside_hours",
  checkSlot({ ...base, startsAt: atLocal(DAY, "09:15", TZ) }).reason, "outside_hours");
t("after closing is outside_hours",
  checkSlot({ ...base, startsAt: atLocal(DAY, "21:00", TZ) }).reason, "outside_hours");
t("shop closed that day",
  checkSlot({ ...base, businessHours: closedThu, startsAt: atLocal(DAY, "13:00", TZ) }).reason,
  "closed_that_day");

/* ── a real booking blocks its own slot, and the buffer blocks the next ── */
const booked = [{
  status: "booked", resource_id: "gleb", service_id: "svc", party_size: 1,
  starts_at: atLocal(DAY, "13:00", TZ).toISOString(),
  ends_at: new Date(atLocal(DAY, "13:00", TZ).getTime() + 45 * 60000).toISOString(),
}];
t("a booked time reports all_busy",
  checkSlot({ ...base, appointments: booked, startsAt: atLocal(DAY, "13:00", TZ) }).reason, "all_busy");
t("45-min step with 45+10 block swallows the next slot too",
  times({ ...base, appointments: booked }).includes("13:45"), false);
t("the slot after the buffer survives",
  times({ ...base, appointments: booked }).includes("14:30"), true);

/* ── "any time" takes the minute the customer said ── */
const anytime = { ...base, service: { ...haircut, slot_mode: "any" } };
t("any-time accepts 13:07", checkSlot({ ...anytime, startsAt: atLocal(DAY, "13:07", TZ) }).ok, true);
t("any-time still refuses 21:00",
  checkSlot({ ...anytime, startsAt: atLocal(DAY, "21:00", TZ) }).reason, "outside_hours");
t("any-time still suggests a tidy grid", times(anytime).slice(0, 2), ["10:00", "10:45"]);

/* ── fixed start times ── */
const yoga = { ...base, service: { ...haircut, slot_mode: "fixed", slot_times: ["11:00:00", "17:00:00"] } };
t("fixed offers only its listed times", times(yoga), ["11:00", "17:00"]);
t("fixed refuses anything else",
  checkSlot({ ...yoga, startsAt: atLocal(DAY, "12:00", TZ) }).reason, "not_a_start_time");

/* ── nobody assigned: capacity is the limit, no person on the booking ── */
const tables = {
  ...base,
  service: { ...haircut, slot_mode: "any", capacity: 3, max_party: 6, duration_min: 90, buffer_min: 0 },
  resources: [], resourceHours: [],
};
t("with no people the lane is the shop's day", times(tables)[0], "09:00");
const noPerson = checkSlot({ ...tables, startsAt: atLocal(DAY, "13:00", TZ), party: 4 });
t("party of 4 fits, with nobody attached", [noPerson.ok, noPerson.resourceId], [true, null]);
t("party of 7 is out of range",
  checkSlot({ ...tables, startsAt: atLocal(DAY, "13:00", TZ), party: 7 }).reason, "party_out_of_range");

const threeTaken = Array.from({ length: 3 }, (_, i) => ({
  status: "booked", resource_id: null, service_id: "svc", party_size: 2,
  starts_at: atLocal(DAY, "13:00", TZ).toISOString(),
  ends_at: new Date(atLocal(DAY, "13:00", TZ).getTime() + 90 * 60000).toISOString(),
}));
t("capacity 3 refuses the fourth",
  checkSlot({ ...tables, appointments: threeTaken, startsAt: atLocal(DAY, "13:00", TZ), party: 2 }).reason,
  "all_busy");

/* ── a class shares seats instead of taking the slot ── */
const cls = {
  ...base,
  service: { ...haircut, booking_mode: "class", slot_mode: "any", capacity: 10, max_party: 10, buffer_min: 0 },
  resources: [], resourceHours: [],
  appointments: [{
    status: "booked", resource_id: null, service_id: "svc", party_size: 6,
    starts_at: atLocal(DAY, "13:00", TZ).toISOString(),
    ends_at: new Date(atLocal(DAY, "13:00", TZ).getTime() + 45 * 60000).toISOString(),
  }],
};
t("class with 6 of 10 sold still takes 4",
  checkSlot({ ...cls, startsAt: atLocal(DAY, "13:00", TZ), party: 4 }).seatsLeft, 4);
t("class refuses 5 more with no seats",
  checkSlot({ ...cls, startsAt: atLocal(DAY, "13:00", TZ), party: 5 }).reason, "no_seats_left");

/* ── shifts and days off ── */
t("a day off removes that person's lane",
  times({ ...base, resourceHours: [{ resource_id: "gleb", weekday: 4, starts_at: "10:00:00", ends_at: "19:00:00", off: true }] }),
  []);
t("no shift row at all means they follow shop hours", times({ ...base, resourceHours: [] })[0], "09:00");

/* ── lead time ── */
t("lead time hides slots that are too soon",
  freeSlots({ ...base, now: atLocal(DAY, "12:00", TZ), service: { ...haircut, lead_time_min: 120 } })
    .map((s) => localTime(s.slot_start, TZ))[0],
  "14:30");

/* ── timezone honesty ── */
t("13:45 Berlin is 11:45 UTC", atLocal(DAY, "13:45", TZ).toISOString(), "2026-09-17T11:45:00.000Z");
t("same wall clock, different zone", atLocal(DAY, "13:45", "Asia/Almaty").toISOString(), "2026-09-17T08:45:00.000Z");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
