"use client";

import { useMemo, useState } from "react";
import { useAppointments, useUpdateAppointment, useDeleteAppointment, useCreateAppointment, useAvailability } from "@/hooks/use-bookings";
import { useServices, useResources, useBusinessHours } from "@/hooks/use-catalogue";
import { cn } from "@/lib/utils";
import { DEFAULT_TZ } from "@/lib/timezone";
import { money, timeOnly } from "@/lib/display";
import { showError, showSuccess } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loading, EmptyState, Hint, Segmented } from "@/components/ui/page";
import {
  CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, LayoutGridIcon,
  ListIcon, LoaderIcon, PhoneIcon, PlusIcon, SparklesIcon, Trash2Icon,
  UserRoundIcon,
} from "lucide-react";


const ROW_PX = 56;          // one hour
const UNASSIGNED = "__none__";
const ALL = "__all__";

const STATUS = {
  booked:    { chip: "bg-info/10 text-info",        block: "bg-info/15 border-info/45 hover:border-info" },
  confirmed: { chip: "bg-success/10 text-success",  block: "bg-success/15 border-success/45 hover:border-success" },
  completed: { chip: "bg-secondary-transparent2 text-secondary", block: "bg-secondary-transparent2 border-secondary-transparent hover:border-secondary/50" },
  cancelled: { chip: "bg-error/10 text-error",      block: "bg-error/10 border-error/35 opacity-55" },
  no_show:   { chip: "bg-warning/10 text-warning",  block: "bg-warning/10 border-warning/40" },
};

/* ── date helpers, all in shop-local time so "today" means the shop's ── */

/**
 * A set of date helpers bound to one timezone.
 *
 * These used to read a module-level constant, which is exactly how every time
 * on the page ended up in Almaty regardless of where the business is. Built
 * per zone and cached, because Intl formatters are not cheap to construct.
 */
const CLOCKS = new Map();

function clockFor(tz) {
  const hit = CLOCKS.get(tz);
  if (hit) return hit;

  const dayFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  });
  // Formatted parts rather than re-parsing a localised string:
  // `new Date(d.toLocaleString(...))` reads the machine's zone, so the same
  // code placed appointments differently depending on where it ran.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  const localDay = (d = new Date()) => dayFmt.format(d);

  const addDays = (day, n) => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return localDay(d);
  };

  /** Monday-first week containing `day`. */
  const weekOf = (day) => {
    const d = new Date(`${day}T12:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7;
    const monday = addDays(day, -dow);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  };

  const tzOffsetMs = (instant) => {
    const x = Object.fromEntries(parts.formatToParts(instant).map((v) => [v.type, v.value]));
    const asUtc = Date.UTC(+x.year, +x.month - 1, +x.day, +x.hour % 24, +x.minute, +x.second);
    return asUtc - instant.getTime();
  };

  /** The instant at which the shop's `day` begins. */
  const localMidnight = (day) => {
    const [y, m, d] = day.split("-").map(Number);
    const naive = Date.UTC(y, m - 1, d, 0, 0, 0);
    // Offset evaluated near the target instant so DST boundaries land right.
    return new Date(naive - tzOffsetMs(new Date(naive)));
  };

  const dayBounds = (day) => {
    const from = localMidnight(day);
    return { from: from.toISOString(), to: new Date(from.getTime() + 864e5).toISOString() };
  };

  /** Minutes past shop-local midnight, read straight off the formatted clock. */
  const minutesInto = (iso) => {
    const x = Object.fromEntries(parts.formatToParts(new Date(iso)).map((v) => [v.type, v.value]));
    return (+x.hour % 24) * 60 + +x.minute;
  };

  const clock = { localDay, addDays, weekOf, localMidnight, dayBounds, minutesInto };
  CLOCKS.set(tz, clock);
  return clock;
}

/**
 * Lay out a column's appointments so overlapping ones sit side by side.
 *
 * Two bookings can legitimately share a time — an unassigned one next to a
 * cancelled one, or two masters' worth of work in the catch-all column — and
 * drawing them at the same coordinates stacked them into an unreadable pile.
 * Events are grouped into clusters of mutual overlap, then packed into the
 * fewest lanes that keep them apart.
 */
function layout(items) {
  const events = items
    .map((a) => ({
      item: a,
      start: new Date(a.starts_at).getTime(),
      end: new Date(a.ends_at).getTime(),
    }))
    .sort((x, y) => x.start - y.start || x.end - y.end);

  const placed = [];
  let cluster = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    const lanes = [];
    for (const ev of cluster) {
      // First lane whose last event has already finished.
      let lane = lanes.findIndex((end) => end <= ev.start);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(ev.end);
      } else {
        lanes[lane] = ev.end;
      }
      ev.lane = lane;
    }
    for (const ev of cluster) placed.push({ ...ev, lanes: lanes.length });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const ev of events) {
    if (cluster.length && ev.start >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.end);
  }
  flush();

  return placed;
}

/** Same geometry as the real grid, so nothing shifts when data lands. */
function TimetableSkeleton({ rows, columns }) {
  return (
    <div className="border border-border rounded-module bg-card overflow-hidden animate-pulse">
      <div className="flex border-b border-secondary-transparent">
        <div className="w-[56px] shrink-0 border-r border-secondary-transparent" />
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="flex-1 px-3 py-2.5 border-r border-secondary-transparent last:border-r-0">
            <div className="h-3 w-20 rounded bg-secondary-transparent2" />
          </div>
        ))}
      </div>
      <div className="flex" style={{ height: rows * ROW_PX }}>
        <div className="w-[56px] shrink-0 border-r border-secondary-transparent" />
        {Array.from({ length: columns }).map((_, c) => (
          <div key={c} className="flex-1 relative border-r border-secondary-transparent last:border-r-0">
            {Array.from({ length: rows }).map((_, r) => (
              <div key={r} className="border-b border-secondary-transparent2" style={{ height: ROW_PX }} />
            ))}
            {[1, 4, 7].map((r) => (
              <div
                key={r}
                className="absolute left-1 right-1 rounded-[7px] bg-secondary-transparent2"
                style={{ top: r * ROW_PX + 4, height: ROW_PX * 1.5 - 8 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BookingsBoard({ language, timezone }) {
  // Every time on this page is the business's own local time.
  const TZ = timezone || DEFAULT_TZ;
  const { localDay, addDays, weekOf, dayBounds, minutesInto } = clockFor(TZ);
  const p = language.app.pages.bookings;
  const res = language.app.res;
  const locale = language.lang === "en" ? "en-GB" : language.lang;

  const [day, setDay] = useState(() => localDay());
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState(null);
  const [groupBy, setGroupBy] = useState("auto");
  const [showEmpty, setShowEmpty] = useState(false);

  const range = useMemo(() => dayBounds(day), [day]);
  const { data: appointments, isLoading, isFetching } = useAppointments(range);
  const { data: services } = useServices();
  const { data: resources, isLoading: loadingResources } = useResources();
  const { data: hours, isLoading: loadingHours } = useBusinessHours();

  // Columns come from resources and the vertical range from opening hours. Drawing
  // before either has landed meant the grid appeared, then re-shaped under the
  // cursor — which is what read as lag.
  const notReady = isLoading || loadingResources || loadingHours;

  const today = localDay();
  const week = useMemo(() => weekOf(day), [day]);

  // Week strip counts come from the day already loaded plus a wider fetch.
  const weekRange = useMemo(
    () => ({ from: dayBounds(week[0]).from, to: dayBounds(week[6]).to }),
    [week],
  );
  const { data: weekAppointments } = useAppointments(weekRange);

  const live = (appointments || []).filter((a) => a.status !== "cancelled");
  const revenue = live.reduce((sum, a) => sum + Number(a.price || 0), 0);

  const active = useMemo(() => (resources || []).filter((r) => r.active), [resources]);

  // Not every business books by person. A restaurant's tables and a studio's
  // classes have nobody attached, so columns-per-person would be one empty
  // lane and everything piled into "unassigned". Group by whatever the day
  // is actually made of, and let the user say otherwise.
  const usesPeople = useMemo(() => {
    const list = (appointments || []).filter((a) => a.status !== "cancelled");
    if (!list.length) return false;
    const withPerson = list.filter((a) => a.resource_id).length;
    return withPerson * 2 > list.length;
  }, [appointments]);

  const effectiveGroup = groupBy === "auto" ? (usesPeople ? "person" : "service") : groupBy;

  const columns = useMemo(() => {
    const list = appointments || [];

    if (effectiveGroup === "none") {
      return [{ id: ALL, name: p.allBookings, icon: "" }];
    }

    if (effectiveGroup === "service") {
      // One lane per service that actually has something on this day.
      const seen = new Map();
      for (const a of list) {
        const id = a.service_id || UNASSIGNED;
        if (!seen.has(id)) seen.set(id, a.services?.name || p.deletedService);
      }
      const cols = [...seen].map(([id, name]) => ({ id, name, icon: "", by: "service" }));
      return cols.length ? cols : [{ id: ALL, name: p.allBookings, icon: "" }];
    }

    // By person: the people who work, plus a lane for anything with nobody on
    // it — which for a table booking is the normal case, not an exception.
    let pool = active;
    if (pool.length > 6 && !showEmpty) {
      const booked = new Set(list.map((a) => a.resource_id).filter(Boolean));
      const used = pool.filter((r) => booked.has(r.id));
      if (used.length) pool = used;
    }

    const cols = pool.map((r) => ({ id: r.id, name: r.name, icon: r.icon, by: "person" }));
    if (list.some((a) => !a.resource_id)) {
      cols.push({ id: UNASSIGNED, name: p.noPerson, icon: "", by: "person" });
    }
    return cols.length ? cols : [{ id: ALL, name: p.allBookings, icon: "" }];
  }, [active, appointments, effectiveGroup, showEmpty, p]);

  // How many people the day-filter is holding back, so the count stays honest.
  const hiddenCount = useMemo(() => {
    if (effectiveGroup !== "person") return 0;
    return Math.max(0, active.length - columns.filter((c) => c.by === "person" && c.id !== UNASSIGNED).length);
  }, [active, columns, effectiveGroup]);

  // Vertical span: the shop's own hours for this weekday, widened to fit
  // anything booked outside them.
  const [startHour, endHour] = useMemo(() => {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    const row = (hours || []).find((h) => h.weekday === weekday);
    let from = row && !row.closed ? Number(String(row.opens).slice(0, 2)) : 9;
    let to = row && !row.closed ? Number(String(row.closes).slice(0, 2)) + 1 : 19;

    for (const a of appointments || []) {
      const startMin = minutesInto(a.starts_at);
      const durationMin =
        (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000;
      from = Math.min(from, Math.floor(startMin / 60));
      to = Math.max(to, Math.ceil((startMin + durationMin) / 60));
    }
    return [Math.max(0, from), Math.min(24, Math.max(to, from + 4))];
  }, [hours, appointments, day]);

  const rows = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  return (
    <div>
      {/* ── week strip ── */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setDay(addDays(day, -7))}
          aria-label={p.prevDay}
          className="size-9 grid place-items-center rounded-button bg-secondary-transparent2 text-secondary hover:text-fg cursor-pointer shrink-0"
        >
          <ChevronLeftIcon className="size-4" />
        </button>

        <div className="flex-1 grid grid-cols-7 gap-1.5">
          {week.map((d) => {
            const count = (weekAppointments || []).filter(
              (a) => a.status !== "cancelled" && localDay(new Date(a.starts_at)) === d,
            ).length;
            const isSel = d === day;
            const isToday = d === today;
            const date = new Date(`${d}T12:00:00Z`);
            return (
              <button
                key={d}
                onClick={() => setDay(d)}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 rounded-button transition-colors cursor-pointer border",
                  isSel
                    ? "bg-fg text-primary border-transparent"
                    : "bg-secondary-transparent2 border-transparent text-secondary hover:text-fg",
                )}
              >
                <span className="text-[10px] uppercase tracking-wide opacity-70">
                  {new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: "short" }).format(date)}
                </span>
                <span className={cn("text-[15px] font-semibold tabular-nums", isToday && !isSel && "text-accent")}>
                  {new Intl.DateTimeFormat(locale, { timeZone: TZ, day: "numeric" }).format(date)}
                </span>
                <span className={cn("text-[10px] tabular-nums", isSel ? "opacity-60" : "text-muted")}>
                  {count || "·"}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setDay(addDays(day, 7))}
          aria-label={p.nextDay}
          className="size-9 grid place-items-center rounded-button bg-secondary-transparent2 text-secondary hover:text-fg cursor-pointer shrink-0"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      {/* ── day summary ── */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div>
          <p className="text-[15px] font-semibold text-fg leading-tight">
            {new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(`${day}T12:00:00Z`))}
          </p>
          <p className="text-[12px] text-secondary">
            {day === today ? p.today : day}
            {live.length > 0 &&
              ` · ${p.countAndValue.replace("{n}", live.length).replace("{value}", money(revenue, live[0]?.currency))}`}
          </p>
        </div>
        {day !== today && (
          <Button variant="ghost" size="sm" onClick={() => setDay(today)}>{p.jumpToday}</Button>
        )}
        <Button className="ml-auto" onClick={() => setAdding(true)}>
          <PlusIcon className="size-4" />
          {p.addBooking}
        </Button>
      </div>

      {/* ── how the day is laid out ── */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Segmented
          value={groupBy}
          onChange={setGroupBy}
          options={[
            { value: "auto", label: p.groups.auto, icon: SparklesIcon },
            ...(active.length ? [{ value: "person", label: p.groups.person, icon: UserRoundIcon }] : []),
            { value: "service", label: p.groups.service, icon: LayoutGridIcon },
            { value: "none", label: p.groups.none, icon: ListIcon },
          ]}
        />
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowEmpty((v) => !v)}
            className="text-[12px] text-secondary hover:text-fg transition-colors cursor-pointer px-2 py-1"
          >
            {showEmpty ? p.filters.hideEmpty : p.filters.showEmpty.replace("{n}", hiddenCount)}
          </button>
        )}
      </div>

      {/* ── timetable ── */}
      {notReady ? (
        <TimetableSkeleton rows={10} columns={2} />
      ) : (
        <div
          className={cn(
            "border border-border rounded-module bg-card overflow-x-auto transition-opacity",
            // Refetching keeps the previous day visible, just dimmed.
            isFetching && "opacity-60",
          )}
        >
          <div className="flex border-b border-secondary-transparent bg-card min-w-max">
            <div className="w-[56px] shrink-0 border-r border-secondary-transparent" />
            {columns.map((c) => (
              <div
                key={c.id}
                className="flex-1 min-w-[132px] px-3 py-2.5 border-r border-secondary-transparent last:border-r-0"
                title={c.name}
              >
                <p className="text-[12px] font-semibold text-fg truncate leading-tight">
                  {c.icon} {c.name}
                </p>

              </div>
            ))}
          </div>

          <div className="relative pt-2 min-w-max">
            <div className="flex" style={{ height: rows.length * ROW_PX }}>
              {/* hour gutter */}
              <div className="w-[56px] shrink-0 border-r border-secondary-transparent">
                {rows.map((h) => (
                  <div key={h} className="relative" style={{ height: ROW_PX }}>
                    <span className="absolute -top-2 right-2 text-[10px] font-mono text-muted tabular-nums">
                      {String(h).padStart(2, "0")}:00
                    </span>
                  </div>
                ))}
              </div>

              {columns.map((c) => {
                const mine = (appointments || []).filter((a) => {
                  if (c.id === ALL) return true;
                  if (c.by === "service") return (a.service_id || UNASSIGNED) === c.id;
                  return c.id === UNASSIGNED ? !a.resource_id : a.resource_id === c.id;
                });
                return (
                  <div key={c.id} className="flex-1 min-w-[132px] relative border-r border-secondary-transparent last:border-r-0">
                    {rows.map((h) => (
                      <div key={h} className="border-b border-secondary-transparent2" style={{ height: ROW_PX }} />
                    ))}

                    {layout(mine).map(({ item: a, lane, lanes }) => {
                      const top = ((minutesInto(a.starts_at) - startHour * 60) / 60) * ROW_PX;
                      const durationMin =
                        (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000;
                      const height = Math.max(22, (durationMin / 60) * ROW_PX - 3);
                      const style = STATUS[a.status] || STATUS.booked;
                      const widthPct = 100 / lanes;
                      return (
                        <button
                          key={a.id}
                          onClick={() => setSelected(a)}
                          style={{
                            top,
                            height,
                            left: `calc(${lane * widthPct}% + 4px)`,
                            width: `calc(${widthPct}% - 8px)`,
                          }}
                          className={cn(
                            "absolute rounded-[7px] border px-2 py-1 text-left overflow-hidden transition-colors cursor-pointer",
                            style.block,
                          )}
                        >
                          {/* Sharing a lane leaves no room for "10:00 Nail art
                              (per hand)" on one line, and the row position
                              already says when it starts — so drop the time. */}
                          <p className="text-[11px] font-semibold text-fg truncate leading-tight">
                            {c.by === "service"
                              ? `${timeOnly(a.starts_at, TZ)} ${a.customer_name || p.noName}`
                              : lanes > 1
                                ? a.services?.name || p.deletedService
                                : `${timeOnly(a.starts_at, TZ)} ${a.services?.name || p.deletedService}`}
                          </p>
                          {height > 34 && (
                            <p className="text-[10px] text-secondary truncate mt-0.5">
                              {lanes > 1 && c.by !== "service" ? timeOnly(a.starts_at, TZ) + " · " : ""}
                              {c.by === "service"
                                ? (a.party_size > 1 ? p.partyOf.replace("{n}", a.party_size) : a.customer_contact || "")
                                : a.customer_name || p.noName}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {!appointments?.length && (
            <div className="px-6 py-10 text-center border-t border-secondary-transparent">
              <CalendarDaysIcon className="size-5 text-muted mx-auto mb-2" />
              <p className="text-[13px] text-fg mb-1">{p.empty.title}</p>
              <Hint className="max-w-[44ch] mx-auto">{p.empty.subtitle}</Hint>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap mt-3">
        {Object.entries(STATUS).map(([key, v]) => (
          <span key={key} className="inline-flex items-center gap-1.5 text-[11px] text-secondary">
            <span className={cn("size-2.5 rounded-[3px] border", v.block)} />
            {p.status[key]}
          </span>
        ))}
      </div>

      {selected && (
        <AppointmentDialog appointment={selected} p={p} res={res} tz={TZ} onClose={() => setSelected(null)} />
      )}
      {adding && (
        <NewBookingDialog p={p} res={res} day={day} services={services} resources={resources} tz={TZ} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}

/* ───────────────────────── appointment detail ────────────────────────── */

function AppointmentDialog({ appointment: a, p, res, tz, onClose }) {
  const update = useUpdateAppointment();
  const remove = useDeleteAppointment();

  // Nudge the clear-away button forward once the booking is behind you.
  const finished = ["completed", "cancelled", "no_show"].includes(a.status);

  function setStatus(status) {
    update.mutate(
      { id: a.id, updates: { status } },
      {
        onSuccess: (r) => {
          if (r?.success === false) return showError(r.message);
          showSuccess(res.bookingUpdated);
          onClose();
        },
        onError: () => showError(res.bookingUpdateError),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{a.services?.name || p.deletedService}</DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-5 pb-3 space-y-3">
          <dl className="space-y-2 text-[13px]">
            <Row label={p.fields.time} value={`${timeOnly(a.starts_at, tz)} – ${timeOnly(a.ends_at, tz)}`} />
            <Row label={p.fields.customerName} value={a.customer_name || p.noName} icon={UserRoundIcon} />
            {a.customer_contact && <Row label={p.fields.customerContact} value={a.customer_contact} icon={PhoneIcon} />}
            {a.resources?.name && <Row label={p.fields.resources} value={`${a.resources.icon || ""} ${a.resources.name}`} />}
            <Row label={p.fields.price} value={money(a.price, a.currency)} />
            {a.note && <Row label={p.fields.note} value={a.note} />}
          </dl>

          <div>
            <p className="text-[12px] text-secondary mb-2">{p.fields.status}</p>
            {finished && <Hint className="mb-2">{p.fields.finishedHint}</Hint>}
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(STATUS).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  disabled={update.isPending}
                  className={cn(
                    "px-2.5 py-1.5 rounded-button text-[12px] font-medium cursor-pointer transition-colors",
                    a.status === s ? "bg-fg text-primary" : "bg-secondary-transparent2 text-secondary hover:text-fg",
                  )}
                >
                  {p.status[s]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant={finished ? "outline" : "ghost"}
            className={cn("mr-auto", !finished && "text-muted")}
            disabled={remove.isPending}
            onClick={() => {
              if (!confirm(p.fields.confirmRemove)) return;
              remove.mutate(a.id, {
                onSuccess: (r) => {
                  if (r?.success === false) return showError(r.message);
                  showSuccess(res.bookingRemoved);
                  onClose();
                },
                onError: () => showError(res.bookingRemoveError),
              });
            }}
          >
            {remove.isPending ? <LoaderIcon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
            {p.fields.remove}
          </Button>
          <Button variant="ghost" onClick={onClose}>{p.fields.cancel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, icon: Icon }) {
  return (
    <div className="flex items-start gap-3">
      <dt className="text-secondary w-[88px] shrink-0 text-[12px]">{label}</dt>
      <dd className="text-fg min-w-0 flex items-center gap-1.5">
        {Icon && <Icon className="size-3.5 text-muted shrink-0" />}
        <span className="truncate">{value}</span>
      </dd>
    </div>
  );
}

/* ─────────────────────────── new booking ─────────────────────────────── */

function NewBookingDialog({ p, res, day, services, resources, tz, onClose }) {
  const [form, setForm] = useState({
    serviceId: services?.[0]?.id || "",
    date: day,
    resourceId: "",
    slot: "",
    customerName: "",
    customerContact: "",
  });

  const create = useCreateAppointment();
  const { data: slots, isLoading: loadingSlots } = useAvailability({
    serviceId: form.serviceId,
    date: form.date,
    resourceId: form.resourceId || undefined,
  });

  // Changing what is being booked invalidates the chosen time.
  const set = (k, v) =>
    setForm((f) => ({ ...f, [k]: v, ...(["serviceId", "date", "resourceId"].includes(k) ? { slot: "" } : {}) }));

  function save(e) {
    e.preventDefault();
    if (!form.serviceId) return showError(p.errors.pickService);
    if (!form.slot) return showError(p.errors.pickSlot);
    if (!form.customerName.trim()) return showError(p.errors.needName);

    create.mutate(
      {
        serviceId: form.serviceId,
        startsAt: form.slot,
        resourceId: form.resourceId || null,
        customerName: form.customerName.trim(),
        customerContact: form.customerContact.trim(),
      },
      {
        onSuccess: (r) => {
          if (r?.success === false) return showError(r.message);
          showSuccess(res.bookingCreated);
          onClose();
        },
        onError: () => showError(res.bookingCreateError),
      },
    );
  }

  // Several masters can be free at the same minute; offer each time once.
  const byTime = useMemo(() => {
    const map = new Map();
    for (const s of slots || []) {
      if (!map.has(s.slot_start)) map.set(s.slot_start, s);
    }
    return [...map.values()];
  }, [slots]);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{p.addBooking}</DialogTitle>
        </DialogHeader>

        <form onSubmit={save} className="px-6 pt-5 pb-3 space-y-4">
          <Field label={p.fields.service}>
            <NativeSelect value={form.serviceId} onChange={(e) => set("serviceId", e.target.value)}>
              <NativeSelectOption value="">{p.fields.servicePlaceholder}</NativeSelectOption>
              {services?.map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {s.name} · {s.duration_min}m · {money(s.price, s.currency)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <div className="flex gap-3">
            <Field label={p.fields.date} className="flex-1">
              <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </Field>
            <Field label={p.fields.resources} className="flex-1">
              <NativeSelect value={form.resourceId} onChange={(e) => set("resourceId", e.target.value)}>
                <NativeSelectOption value="">{p.fields.anyResource}</NativeSelectOption>
                {resources?.filter((r) => r.active).map((s) => (
                  <NativeSelectOption key={s.id} value={s.id}>{s.name}</NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <Field label={p.fields.time}>
            {loadingSlots ? (
              <div className="py-3 text-[12px] text-secondary flex items-center gap-2">
                <LoaderIcon className="size-3.5 animate-spin" />
                {p.fields.loadingSlots}
              </div>
            ) : !byTime.length ? (
              <Hint className="py-2">{p.fields.noSlots}</Hint>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto scrollbar-none">
                {byTime.map((s) => (
                  <button
                    key={s.slot_start}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, slot: s.slot_start }))}
                    className={cn(
                      "px-2.5 py-1.5 rounded-button text-[12px] font-medium tabular-nums transition-colors cursor-pointer",
                      form.slot === s.slot_start
                        ? "bg-fg text-primary"
                        : "bg-secondary-transparent2 text-secondary hover:text-fg",
                    )}
                    title={s.resource_name || ""}
                  >
                    {timeOnly(s.slot_start, tz)}
                  </button>
                ))}
              </div>
            )}
          </Field>

          <div className="flex gap-3">
            <Field label={p.fields.customerName} className="flex-1">
              <Input value={form.customerName} onChange={(e) => set("customerName", e.target.value)} />
            </Field>
            <Field label={p.fields.customerContact} className="flex-1">
              <Input value={form.customerContact} onChange={(e) => set("customerContact", e.target.value)} placeholder="+7 …" />
            </Field>
          </div>
        </form>

        <DialogFooter>
          <Button variant="ghost" type="button" onClick={onClose}>{p.fields.cancel}</Button>
          <Button onClick={save} disabled={create.isPending}>
            {create.isPending ? <LoaderIcon className="size-4 animate-spin" /> : p.fields.book}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
