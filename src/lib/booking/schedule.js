/**
 * When a thing can be booked.
 *
 * Pure functions over plain data — no database, no network. The caller loads
 * the rows; this decides. That matters because the rules change often, and
 * for a long time they lived in a Postgres function where nothing could test
 * them: three separate bugs shipped, including one where the offer and the
 * check anchored their grids to different times, so a service offered ten
 * slots a day and refused all ten.
 *
 * `lanesFor` is the single place a bookable window is described. Both the
 * offer and the check read it, so the two can no longer disagree.
 */

const HHMM = (t) => String(t ?? "").slice(0, 5);

/* ─────────────────────────── timezone plumbing ─────────────────────────── */

const PARTS = new Map();

function partsFor(timezone) {
  let fmt = PARTS.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    PARTS.set(timezone, fmt);
  }
  return fmt;
}

/** Offset of `timezone` at a given instant, in milliseconds. */
function offsetAt(instant, timezone) {
  const p = Object.fromEntries(
    partsFor(timezone).formatToParts(instant).map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - instant.getTime();
}

/**
 * "2026-09-17" + "13:45" in `timezone` → the real instant.
 *
 * The offset is evaluated near the target instant rather than now, so a
 * booking either side of a DST change lands on the wall clock the customer
 * actually said.
 */
export function atLocal(day, time, timezone) {
  const [h, m] = HHMM(time).split(":").map(Number);
  const [y, mo, d] = String(day).split("-").map(Number);
  const naive = Date.UTC(y, mo - 1, d, h || 0, m || 0, 0);
  const guess = new Date(naive - offsetAt(new Date(naive), timezone));
  // One correction settles the case where the guess crossed the boundary.
  return new Date(naive - offsetAt(guess, timezone));
}

/** The weekday (0=Sunday) that `day` falls on. */
export function weekdayOf(day) {
  const [y, m, d] = String(day).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The local calendar day an instant falls on, as "YYYY-MM-DD". */
export function localDay(instant, timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(instant instanceof Date ? instant : new Date(instant));
}

/** Local "HH:MM" for an instant. */
export function localTime(instant, timezone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(instant instanceof Date ? instant : new Date(instant));
}

/* ──────────────────────────────── lanes ───────────────────────────────── */

const MIN = 60_000;
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

/**
 * The windows this service can be booked into on one day.
 *
 * With people assigned, one lane per person, bounded by their shift inside
 * the shop's hours. With nobody assigned, a single shared lane the width of
 * the shop's day, holding `capacity` at once.
 *
 * `origin` is where that lane's step grid starts counting — the whole reason
 * this function exists in one place.
 */
export function lanesFor({ service, day, timezone, businessHours, resources, resourceHours, resourceId }) {
  const weekday = weekdayOf(day);
  const shop = (businessHours || []).find((h) => h.weekday === weekday);

  if (shop?.closed) return { closed: true, lanes: [] };

  const open = atLocal(day, shop ? HHMM(shop.opens) : "09:00", timezone);
  const shut = atLocal(day, shop ? HHMM(shop.closes) : "18:00", timezone);

  const people = (resources || []).filter((r) => r.active !== false);
  if (!people.length) {
    if (resourceId) return { closed: false, lanes: [] };   // asked for someone who does not do this
    return {
      closed: false,
      lanes: [{ id: null, name: null, from: open, to: shut, origin: open, capacity: Math.max(service.capacity || 1, 1) }],
    };
  }

  const lanes = [];
  for (const person of people) {
    if (resourceId && person.id !== resourceId) continue;

    const shift = (resourceHours || []).find(
      (h) => h.resource_id === person.id && h.weekday === weekday,
    );
    if (shift?.off) continue;

    const from = shift ? new Date(Math.max(open.getTime(), atLocal(day, HHMM(shift.starts_at), timezone).getTime())) : open;
    const to   = shift ? new Date(Math.min(shut.getTime(), atLocal(day, HHMM(shift.ends_at),   timezone).getTime())) : shut;
    if (from >= to) continue;

    // A person's grid counts from when they start, not when the shop opens.
    lanes.push({
      id: person.id, name: person.name, from, to, origin: from,
      capacity: Math.max(service.capacity || 1, 1),
    });
  }

  return { closed: false, lanes };
}

/** Candidate start times inside one lane, however the admin defined them. */
function startsIn(lane, { service, day, timezone }) {
  const block = (service.duration_min + (service.buffer_min || 0)) * MIN;

  if (service.slot_mode === "fixed") {
    return (service.slot_times || [])
      .map((t) => atLocal(day, HHMM(t), timezone))
      .filter((t) => t >= lane.from && t.getTime() + block <= lane.to.getTime());
  }

  const step = Math.max(service.slot_step_min || 30, 5) * MIN;
  const out = [];
  for (let t = lane.origin.getTime(); t + block <= lane.to.getTime(); t += step) {
    if (t >= lane.from.getTime()) out.push(new Date(t));
  }
  return out;
}

/** Is `startsAt` one of the times this lane starts at? */
function onGrid(lane, startsAt, { service, day, timezone }) {
  if (service.slot_mode === "any") return true;

  if (service.slot_mode === "fixed") {
    return (service.slot_times || []).some(
      (t) => atLocal(day, HHMM(t), timezone).getTime() === startsAt.getTime(),
    );
  }

  const step = Math.max(service.slot_step_min || 30, 5) * MIN;
  return (startsAt.getTime() - lane.origin.getTime()) % step === 0;
}

/**
 * What this lane still has free at `startsAt`.
 *
 * `seatsLeft` counts people for a class and concurrent bookings for anything
 * else — a table for four takes one table, not four of them. `needed` says
 * which of the two the caller must compare against.
 */
function usageIn(lane, startsAt, { service, appointments, party = 1 }) {
  const shared = service.booking_mode === "class";
  const buffer = (service.buffer_min || 0) * MIN;
  const end = startsAt.getTime() + service.duration_min * MIN;

  const live = (appointments || []).filter((a) => {
    if (!["booked", "confirmed"].includes(a.status)) return false;
    // A lane with nobody attached is the whole service; a person's lane is theirs.
    return lane.id ? a.resource_id === lane.id : a.service_id === service.id;
  });

  if (shared) {
    const taken = live
      .filter((a) => overlaps(+new Date(a.starts_at), +new Date(a.ends_at), startsAt.getTime(), end))
      .reduce((sum, a) => sum + (a.party_size || 1), 0);
    return { seatsLeft: lane.capacity - taken, needed: party };
  }

  // The cleanup after a booking belongs to that booking, so an existing one
  // holds its slot AND its buffer. Applying it only to the candidate let the
  // next booking start while the chair was still being swept.
  const busy = live.filter((a) =>
    overlaps(
      +new Date(a.starts_at), +new Date(a.ends_at) + buffer,
      startsAt.getTime(), end + buffer,
    ),
  ).length;
  return { seatsLeft: lane.capacity - busy, needed: 1 };
}

/* ─────────────────────────────── the API ──────────────────────────────── */

/**
 * Every free start time on one day, one row per lane that can take it.
 * Shape matches what the dashboard and the assistant already expect.
 */
export function freeSlots(input) {
  const { service, day, timezone, party = 1, now = new Date() } = input;
  if (!service?.active) return [];
  if (party > Math.max(service.max_party || 1, service.min_party || 1)) return [];

  const { closed, lanes } = lanesFor(input);
  if (closed) return [];

  const earliest = now.getTime() + (service.lead_time_min || 0) * MIN;
  const out = [];

  for (const lane of lanes) {
    for (const start of startsIn(lane, input)) {
      if (start.getTime() < earliest) continue;
      const { seatsLeft, needed } = usageIn(lane, start, input);
      if (seatsLeft < needed) continue;

      out.push({
        slot_start: start.toISOString(),
        slot_end: new Date(start.getTime() + service.duration_min * MIN).toISOString(),
        resource_id: lane.id,
        resource_name: lane.name,
        seats_left: seatsLeft,
      });
    }
  }

  return out.sort((a, b) => a.slot_start.localeCompare(b.slot_start));
}

/**
 * Can this exact instant be booked?
 *
 * Reads the same lanes as `freeSlots`, so a time that was offered cannot be
 * refused for being off-grid. `reason` is meant to be shown to a customer.
 */
export function checkSlot(input) {
  const { service, day, timezone, startsAt, party = 1, now = new Date() } = input;
  const at = startsAt instanceof Date ? startsAt : new Date(startsAt);

  if (!service?.active) return { ok: false, reason: "service_not_found" };

  const min = service.min_party || 1;
  const max = Math.max(service.max_party || 1, min);
  if (party < min || party > max) return { ok: false, reason: "party_out_of_range", min, max };

  const { closed, lanes } = lanesFor(input);
  if (closed) return { ok: false, reason: "closed_that_day" };
  if (!lanes.length) return { ok: false, reason: "no_such_person" };

  if (at.getTime() < now.getTime() + (service.lead_time_min || 0) * MIN) {
    return { ok: false, reason: "too_soon" };
  }

  const block = (service.duration_min + (service.buffer_min || 0)) * MIN;
  let covered = false;   // some lane's window contains this time
  let onAGrid = false;   // and it is one of that lane's start times

  for (const lane of lanes) {
    if (at < lane.from || at.getTime() + block > lane.to.getTime()) continue;
    covered = true;

    if (!onGrid(lane, at, input)) continue;
    onAGrid = true;

    const { seatsLeft, needed } = usageIn(lane, at, input);
    if (seatsLeft >= needed) {
      return { ok: true, reason: "free", resourceId: lane.id, seatsLeft };
    }
  }

  // Saying "fully booked" when the truth is "we do not start then" is how the
  // assistant ended up inventing a customer who took the slot first.
  if (!covered) return { ok: false, reason: "outside_hours" };
  if (!onAGrid) return { ok: false, reason: service.slot_mode === "fixed" ? "not_a_start_time" : "off_grid" };
  return { ok: false, reason: service.booking_mode === "class" ? "no_seats_left" : "all_busy" };
}
