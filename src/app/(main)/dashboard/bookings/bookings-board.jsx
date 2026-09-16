"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppointments, useUpdateAppointment, useDeleteAppointment, useCreateAppointment, useAvailability } from "@/hooks/use-bookings";
import { useServices, useResources, useBusinessHours, useServiceResourceMap } from "@/hooks/use-catalogue";
import { cn } from "@/lib/utils";
import { DEFAULT_TZ } from "@/lib/timezone";
import { money, timeOnly } from "@/lib/display";
import { showError, showSuccess } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Hint, Segmented } from "@/components/ui/page";
import {
  CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, LayoutGridIcon,
  ListIcon, LoaderIcon, PhoneIcon, PlusIcon, SparklesIcon, Trash2Icon,
  UserRoundIcon,
} from "lucide-react";


const ROW_PX = 64;          // one hour
const UNASSIGNED = "__none__";
const ALL = "__all__";

const STATUS = {
  booked:    { chip: "bg-info/10 text-info",        block: "bg-info/12 border-info/40 hover:border-info/80",           rail: "bg-info" },
  confirmed: { chip: "bg-success/10 text-success",  block: "bg-success/12 border-success/40 hover:border-success/80",  rail: "bg-success" },
  completed: { chip: "bg-secondary-transparent2 text-secondary", block: "bg-secondary-transparent2 border-secondary-transparent hover:border-secondary/50", rail: "bg-secondary" },
  cancelled: { chip: "bg-error/10 text-error",      block: "bg-error/8 border-error/30 opacity-50",                    rail: "bg-error" },
  no_show:   { chip: "bg-warning/10 text-warning",  block: "bg-warning/10 border-warning/40",                          rail: "bg-warning" },
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
        <div className="w-[60px] shrink-0 border-r border-secondary-transparent" />
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="flex-1 px-3 py-3 border-r border-secondary-transparent last:border-r-0">
            <div className="h-3 w-20 rounded bg-secondary-transparent2" />
          </div>
        ))}
      </div>
      <div className="flex" style={{ height: rows * ROW_PX }}>
        <div className="w-[60px] shrink-0 border-r border-secondary-transparent" />
        {Array.from({ length: columns }).map((_, c) => (
          <div key={c} className="flex-1 relative border-r border-secondary-transparent last:border-r-0">
            {Array.from({ length: rows }).map((_, r) => (
              <div key={r} className="border-b border-secondary-transparent2" style={{ height: ROW_PX }} />
            ))}
            {[1, 4, 7].map((r) => (
              <div
                key={r}
                className="absolute left-1 right-1 rounded-[8px] bg-secondary-transparent2"
                style={{ top: r * ROW_PX + 4, height: ROW_PX * 1.5 - 8 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Minutes past local midnight, right now — the position of the "now" line. */
function useNowMinutes(tz) {
  const read = () => {
    const x = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" })
        .formatToParts(new Date())
        .map((v) => [v.type, v.value]),
    );
    return (Number(x.hour) % 24) * 60 + Number(x.minute);
  };

  const [minutes, setMinutes] = useState(read);

  useEffect(() => {
    setMinutes(read());
    // A line that only moves on reload is worse than no line — it quietly
    // lies about where the day is.
    const id = setInterval(() => setMinutes(read()), 60_000);
    return () => clearInterval(id);
  }, [tz]);

  return minutes;
}

export default function BookingsBoard({ language, timezone }) {
  // Every time on this page is the business's own local time.
  const TZ = timezone || DEFAULT_TZ;
  const { localDay, addDays, weekOf, dayBounds, minutesInto } = clockFor(TZ);
  const p = language.app.pages.bookings;
  const res = language.app.res;
  const locale = language.lang === "en" ? "en-GB" : language.lang;

  const [day, setDay] = useState(() => localDay());
  const [adding, setAdding] = useState(null);       // null | {} | { date, time, resourceId, serviceId }
  const [selected, setSelected] = useState(null);
  const [groupBy, setGroupBy] = useState("auto");
  const [view, setView] = useState("timetable");
  const [showEmpty, setShowEmpty] = useState(false);

  const range = useMemo(() => dayBounds(day), [day]);
  const { data: appointments, isLoading, isFetching } = useAppointments(range);
  const { data: services } = useServices();
  const { data: resources, isLoading: loadingResources } = useResources();
  const { data: hours, isLoading: loadingHours } = useBusinessHours();
  // Which people do which service, so clicking a master's column does not
  // open the form on a service they have never performed.
  const { data: serviceResources } = useServiceResourceMap();

  // Columns come from resources and the vertical range from opening hours. Drawing
  // before either has landed meant the grid appeared, then re-shaped under the
  // cursor — which is what read as lag.
  const notReady = isLoading || loadingResources || loadingHours;

  const today = localDay();
  const week = useMemo(() => weekOf(day), [day]);
  const nowMinutes = useNowMinutes(TZ);

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

  // When this weekday opens and closes, in minutes past midnight. Everything
  // outside is drawn as closed rather than as ordinary empty time.
  const openWindow = useMemo(() => {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    const row = (hours || []).find((h) => h.weekday === weekday);
    if (!row || row.closed) return null;
    const mins = (t) => Number(String(t).slice(0, 2)) * 60 + Number(String(t).slice(3, 5));
    return { from: mins(row.opens), to: mins(row.closes) };
  }, [hours, day]);

  // Vertical span: the shop's own hours for this weekday, widened to fit
  // anything booked outside them.
  const [startHour, endHour] = useMemo(() => {
    let from = openWindow ? Math.floor(openWindow.from / 60) : 9;
    let to = openWindow ? Math.ceil(openWindow.to / 60) + 1 : 19;

    for (const a of appointments || []) {
      const startMin = minutesInto(a.starts_at);
      const durationMin =
        (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000;
      from = Math.min(from, Math.floor(startMin / 60));
      to = Math.max(to, Math.ceil((startMin + durationMin) / 60));
    }
    return [Math.max(0, from), Math.min(24, Math.max(to, from + 4))];
  }, [openWindow, appointments, day, minutesInto]);

  const rows = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const yOf = (minutes) => ((minutes - startHour * 60) / 60) * ROW_PX;
  const showNow = day === today && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60;

  /** Clicking empty time books it — with the column and the hour filled in. */
  function bookAt(column, minutes) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    const person = column?.by === "person" && column.id !== UNASSIGNED ? column.id : "";

    // A person's column opens on something they actually do. Defaulting to the
    // first service in the catalogue produced a form that opened on "no free
    // times" because that master does not perform it at all.
    let serviceId = column?.by === "service" && column.id !== UNASSIGNED ? column.id : "";
    if (!serviceId && person && serviceResources) {
      const theirs = (services || []).find((sv) => (serviceResources[sv.id] || []).includes(person));
      if (theirs) serviceId = theirs.id;
    }

    setAdding({ date: day, time: `${hh}:${mm}`, resourceId: person, serviceId });
  }

  return (
    <div>
      {/* ── week strip ── */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setDay(addDays(day, -7))}
          aria-label={p.prevDay}
          className="size-9 grid place-items-center rounded-button bg-secondary-transparent2 text-secondary hover:text-fg transition-colors cursor-pointer shrink-0"
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
                {/* Dots, not a number: how busy a day is reads faster as shape. */}
                <span className="h-[5px] flex items-center gap-[2px]">
                  {count === 0 ? (
                    <span className={cn("size-[3px] rounded-full", isSel ? "bg-primary/30" : "bg-muted/40")} />
                  ) : (
                    Array.from({ length: Math.min(count, 4) }).map((_, i) => (
                      <span
                        key={i}
                        className={cn("size-[4px] rounded-full", isSel ? "bg-primary/60" : "bg-accent/70")}
                      />
                    ))
                  )}
                  {count > 4 && (
                    <span className={cn("text-[9px] tabular-nums ml-0.5", isSel ? "text-primary/60" : "text-muted")}>
                      +{count - 4}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setDay(addDays(day, 7))}
          aria-label={p.nextDay}
          className="size-9 grid place-items-center rounded-button bg-secondary-transparent2 text-secondary hover:text-fg transition-colors cursor-pointer shrink-0"
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
            {openWindow === null && ` · ${p.closedToday}`}
          </p>
        </div>
        {day !== today && (
          <Button variant="ghost" size="sm" onClick={() => setDay(today)}>{p.jumpToday}</Button>
        )}
        <Button className="ml-auto" onClick={() => setAdding({ date: day })}>
          <PlusIcon className="size-4" />
          {p.addBooking}
        </Button>
      </div>

      {/* ── how the day is laid out ── */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "timetable", label: p.views.timetable, icon: LayoutGridIcon },
            { value: "agenda", label: p.views.agenda, icon: ListIcon },
          ]}
        />
        {view === "timetable" && (
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
        )}
        {view === "timetable" && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowEmpty((v) => !v)}
            className="text-[12px] text-secondary hover:text-fg transition-colors cursor-pointer px-2 py-1"
          >
            {showEmpty ? p.filters.hideEmpty : p.filters.showEmpty.replace("{n}", hiddenCount)}
          </button>
        )}
      </div>

      {/* ── the day itself ── */}
      {notReady ? (
        <TimetableSkeleton rows={10} columns={2} />
      ) : view === "agenda" ? (
        <Agenda
          appointments={appointments}
          tz={TZ}
          locale={locale}
          p={p}
          onOpen={setSelected}
        />
      ) : (
        <div
          className={cn(
            "border border-border rounded-module bg-card overflow-x-auto transition-opacity",
            // Refetching keeps the previous day visible, just dimmed.
            isFetching && "opacity-60",
          )}
        >
          <div className="flex border-b border-secondary-transparent bg-card min-w-max sticky top-0 z-20">
            <div className="w-[60px] shrink-0 border-r border-secondary-transparent bg-card" />
            {columns.map((c) => {
              const count = (appointments || []).filter((a) => {
                if (a.status === "cancelled") return false;
                if (c.id === ALL) return true;
                if (c.by === "service") return (a.service_id || UNASSIGNED) === c.id;
                return c.id === UNASSIGNED ? !a.resource_id : a.resource_id === c.id;
              }).length;

              return (
                <div
                  key={c.id}
                  className="flex-1 min-w-[150px] px-3 py-2.5 border-r border-secondary-transparent last:border-r-0 bg-card"
                  title={c.name}
                >
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] font-semibold text-fg truncate leading-tight min-w-0">
                      {c.icon} {c.name}
                    </p>
                    <span
                      className={cn(
                        "ml-auto shrink-0 text-[10px] tabular-nums px-1.5 py-0.5 rounded-full",
                        count ? "bg-secondary-transparent2 text-secondary" : "text-muted",
                      )}
                    >
                      {count}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="relative pt-2 min-w-max">
            <div className="flex" style={{ height: rows.length * ROW_PX }}>
              {/* hour gutter */}
              <div className="w-[60px] shrink-0 border-r border-secondary-transparent relative">
                {rows.map((h) => (
                  <div key={h} className="relative" style={{ height: ROW_PX }}>
                    <span className="absolute -top-2 right-2 text-[10px] font-mono text-muted tabular-nums">
                      {String(h).padStart(2, "0")}:00
                    </span>
                  </div>
                ))}
                {showNow && (
                  <span
                    className="absolute right-1.5 -translate-y-1/2 text-[10px] font-mono tabular-nums text-accent bg-card px-1 rounded z-10"
                    style={{ top: yOf(nowMinutes) }}
                  >
                    {String(Math.floor(nowMinutes / 60)).padStart(2, "0")}:
                    {String(nowMinutes % 60).padStart(2, "0")}
                  </span>
                )}
              </div>

              {columns.map((c) => {
                const mine = (appointments || []).filter((a) => {
                  if (c.id === ALL) return true;
                  if (c.by === "service") return (a.service_id || UNASSIGNED) === c.id;
                  return c.id === UNASSIGNED ? !a.resource_id : a.resource_id === c.id;
                });
                return (
                  <div key={c.id} className="flex-1 min-w-[150px] relative border-r border-secondary-transparent last:border-r-0 group/col">
                    {rows.map((h) => {
                      // Outside opening hours, and the half-hour guide inside.
                      const closedTop = openWindow === null || h * 60 + 30 <= openWindow.from || h * 60 >= openWindow.to;
                      const closedBottom = openWindow === null || h * 60 + 60 <= openWindow.from || h * 60 + 30 >= openWindow.to;
                      return (
                        <div key={h} className="border-b border-secondary-transparent2 relative" style={{ height: ROW_PX }}>
                          <button
                            type="button"
                            aria-label={p.bookAtHint}
                            onClick={() => bookAt(c, h * 60)}
                            className={cn(
                              "absolute inset-x-0 top-0 h-1/2 transition-colors cursor-pointer",
                              closedTop ? "bg-primary/40" : "hover:bg-accent/[0.07]",
                            )}
                          />
                          <button
                            type="button"
                            aria-label={p.bookAtHint}
                            onClick={() => bookAt(c, h * 60 + 30)}
                            className={cn(
                              "absolute inset-x-0 bottom-0 h-1/2 border-t border-dashed border-secondary-transparent2 transition-colors cursor-pointer",
                              closedBottom ? "bg-primary/40" : "hover:bg-accent/[0.07]",
                            )}
                          />
                        </div>
                      );
                    })}

                    {showNow && (
                      <span
                        className="absolute inset-x-0 h-px bg-accent/70 pointer-events-none z-10"
                        style={{ top: yOf(nowMinutes) }}
                      />
                    )}

                    {layout(mine).map(({ item: a, lane, lanes }) => {
                      const top = yOf(minutesInto(a.starts_at));
                      const durationMin =
                        (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000;
                      const height = Math.max(24, (durationMin / 60) * ROW_PX - 3);
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
                            "absolute rounded-[8px] border pl-2.5 pr-2 py-1 text-left overflow-hidden cursor-pointer z-10",
                            "transition-[transform,border-color,box-shadow] duration-150 hover:z-20 hover:shadow-box-shadow",
                            style.block,
                          )}
                        >
                          {/* A colour rail reads as status even at 24px tall,
                              where a badge would not fit at all. */}
                          <span className={cn("absolute left-0 inset-y-0 w-[3px] rounded-l-[8px]", style.rail)} />

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
                          {height > 36 && (
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
        {view === "timetable" && (
          <span className="text-[11px] text-muted ml-auto inline-flex items-center gap-1.5">
            <ClockIcon className="size-3" />
            {p.bookAtHint}
          </span>
        )}
      </div>

      {selected && (
        <AppointmentDialog appointment={selected} p={p} res={res} tz={TZ} onClose={() => setSelected(null)} />
      )}
      {adding && (
        <NewBookingDialog
          p={p}
          res={res}
          initial={adding}
          services={services}
          resources={resources}
          tz={TZ}
          onClose={() => setAdding(null)}
        />
      )}
    </div>
  );
}

/**
 * The day as a list.
 *
 * A timetable answers "when is this person free"; a list answers "what is
 * happening next", which is the question anyone actually standing at the desk
 * is asking. It also survives a phone screen, which columns do not.
 */
function Agenda({ appointments, tz, locale, p, onOpen }) {
  const items = useMemo(
    () => [...(appointments || [])].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)),
    [appointments],
  );

  if (!items.length) {
    return (
      <div className="border border-border rounded-module bg-card px-6 py-12 text-center">
        <CalendarDaysIcon className="size-5 text-muted mx-auto mb-2" />
        <p className="text-[13px] text-fg mb-1">{p.empty.title}</p>
        <Hint className="max-w-[44ch] mx-auto">{p.empty.subtitle}</Hint>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-module bg-card overflow-hidden">
      {items.map((a) => {
        const style = STATUS[a.status] || STATUS.booked;
        return (
          <button
            key={a.id}
            onClick={() => onOpen(a)}
            className="w-full text-left flex items-center gap-3 px-4 py-3 border-b border-secondary-transparent2 last:border-b-0 hover:bg-hover transition-colors cursor-pointer"
          >
            <div className="w-[86px] shrink-0">
              <p className="text-[13px] font-semibold text-fg tabular-nums leading-tight">
                {timeOnly(a.starts_at, tz)}
              </p>
              <p className="text-[10px] text-muted tabular-nums">{timeOnly(a.ends_at, tz)}</p>
            </div>

            <span className={cn("w-[3px] self-stretch rounded-full shrink-0", style.rail)} />

            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-fg truncate">{a.services?.name || p.deletedService}</p>
              <p className="text-[11px] text-secondary truncate mt-0.5">
                {a.customer_name || p.noName}
                {a.resources?.name && ` · ${a.resources.icon || ""} ${a.resources.name}`}
                {a.party_size > 1 && ` · ${p.partyOf.replace("{n}", a.party_size)}`}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-[12px] text-fg tabular-nums">{money(a.price, a.currency)}</p>
              <span className={cn("inline-block text-[10px] px-1.5 py-0.5 rounded-full mt-0.5", style.chip)}>
                {p.status[a.status]}
              </span>
            </div>
          </button>
        );
      })}
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
            {a.resources?.name && <Row label={p.fields.resource} value={`${a.resources.icon || ""} ${a.resources.name}`} />}
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

function NewBookingDialog({ p, res, initial, services, resources, tz, onClose }) {
  const [form, setForm] = useState({
    serviceId: initial?.serviceId || services?.[0]?.id || "",
    date: initial?.date,
    resourceId: initial?.resourceId || "",
    slot: "",
    customerName: "",
    customerContact: "",
  });
  // Set once from the cell that was clicked, then forgotten — otherwise
  // changing the service would silently drag the time back.
  const [wanted, setWanted] = useState(initial?.time || null);

  const create = useCreateAppointment();
  const { data: slots, isLoading: loadingSlots } = useAvailability({
    serviceId: form.serviceId,
    date: form.date,
    resourceId: form.resourceId || undefined,
  });

  // Changing what is being booked invalidates the chosen time.
  const set = (k, v) => {
    if (["serviceId", "date", "resourceId"].includes(k)) setWanted(null);
    setForm((f) => ({ ...f, [k]: v, ...(["serviceId", "date", "resourceId"].includes(k) ? { slot: "" } : {}) }));
  };

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

  /**
   * Land on the time the operator clicked.
   *
   * The exact minute may not be offered — the service has its own grid — so
   * the nearest free time at or after it is chosen instead, which is what
   * anyone clicking an empty 14:00 cell actually means.
   */
  useEffect(() => {
    if (!wanted || form.slot || !byTime.length) return;
    const hit =
      byTime.find((s) => timeOnly(s.slot_start, tz) >= wanted) || byTime[byTime.length - 1];
    if (hit) setForm((f) => ({ ...f, slot: hit.slot_start }));
  }, [wanted, byTime, form.slot, tz]);

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
            <Field label={p.fields.resource} className="flex-1">
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
                    ref={(el) => form.slot === s.slot_start && el?.scrollIntoView({ block: "nearest" })}
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
