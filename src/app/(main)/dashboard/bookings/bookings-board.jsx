"use client";

import { useMemo, useState } from "react";
import { useAppointments, useUpdateAppointment, useCreateAppointment, useAvailability } from "@/hooks/use-bookings";
import { useServices, useStaff } from "@/hooks/use-catalogue";
import { cn } from "@/lib/utils";
import { money, timeOnly } from "@/lib/display";
import { showError, showSuccess } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, LoaderIcon,
  PhoneIcon, PlusIcon, UserRoundIcon,
} from "lucide-react";

const TZ = "Asia/Almaty";

const STATUS_STYLES = {
  booked: "bg-info/10 text-info",
  confirmed: "bg-success/10 text-success",
  completed: "bg-secondary-transparent2 text-secondary",
  cancelled: "bg-error/10 text-error",
  no_show: "bg-warning/10 text-warning",
};

/** YYYY-MM-DD in shop-local time, so "today" means the shop's today. */
function localDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return localDay(d);
}

function dayBounds(day) {
  // The RPC works in instants; a shop day is 00:00–24:00 local.
  const start = new Date(`${day}T00:00:00`);
  const offsetProbe = new Date(`${day}T12:00:00Z`);
  const local = new Date(offsetProbe.toLocaleString("en-US", { timeZone: TZ }));
  const utc = new Date(offsetProbe.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = utc.getTime() - local.getTime();
  const from = new Date(start.getTime() + offsetMs);
  return { from: from.toISOString(), to: new Date(from.getTime() + 864e5).toISOString() };
}

export default function BookingsBoard({ language }) {
  const p = language.app.pages.bookings;
  const res = language.app.res;

  const [day, setDay] = useState(() => localDay());
  const [adding, setAdding] = useState(false);

  const range = useMemo(() => dayBounds(day), [day]);
  const { data: appointments, isLoading } = useAppointments(range);
  const { data: services } = useServices();
  const { data: staff } = useStaff();

  const today = localDay();
  const heading = new Intl.DateTimeFormat(language.lang === "en" ? "en-GB" : language.lang, {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long",
  }).format(new Date(`${day}T12:00:00Z`));

  const live = (appointments || []).filter((a) => a.status !== "cancelled");
  const revenue = live.reduce((sum, a) => sum + Number(a.price || 0), 0);

  return (
    <div className="mt-8">
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDay(addDays(day, -1))}
            aria-label={p.prevDay}
            className="size-8 grid place-items-center rounded-button bg-secondary-transparent2 text-secondary hover:text-fg cursor-pointer"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <button
            onClick={() => setDay(addDays(day, 1))}
            aria-label={p.nextDay}
            className="size-8 grid place-items-center rounded-button bg-secondary-transparent2 text-secondary hover:text-fg cursor-pointer"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>

        <div>
          <p className="text-[15px] font-semibold text-fg leading-tight">{heading}</p>
          <p className="text-[11px] text-muted">
            {day === today ? p.today : day}
            {live.length > 0 && ` · ${p.countAndValue.replace("{n}", live.length).replace("{value}", money(revenue, live[0]?.currency))}`}
          </p>
        </div>

        {day !== today && (
          <Button variant="ghost" size="sm" onClick={() => setDay(today)}>
            {p.jumpToday}
          </Button>
        )}

        <Button className="ml-auto" onClick={() => setAdding(true)}>
          <PlusIcon className="size-4" />
          {p.addBooking}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <LoaderIcon className="animate-spin text-muted size-6" />
        </div>
      ) : !appointments?.length ? (
        <div className="border border-dashed border-border rounded-module px-6 py-16 text-center">
          <CalendarDaysIcon className="size-6 text-muted mx-auto mb-3" />
          <p className="text-[14px] text-fg mb-1">{p.empty.title}</p>
          <p className="text-[12px] text-muted max-w-sm mx-auto leading-relaxed">{p.empty.subtitle}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {appointments.map((a) => (
            <AppointmentRow key={a.id} appointment={a} p={p} res={res} staff={staff} />
          ))}
        </div>
      )}

      {adding && (
        <NewBookingDialog
          p={p}
          res={res}
          day={day}
          services={services}
          staff={staff}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function AppointmentRow({ appointment: a, p, res, staff }) {
  const update = useUpdateAppointment();
  const cancelled = a.status === "cancelled";

  function setStatus(status) {
    update.mutate(
      { id: a.id, updates: { status } },
      {
        onSuccess: (r) => (r?.success === false ? showError(r.message) : showSuccess(res.bookingUpdated)),
        onError: () => showError(res.bookingUpdateError),
      },
    );
  }

  return (
    <div
      className={cn(
        "border border-border rounded-module bg-card px-4 py-3 flex items-center gap-4",
        cancelled && "opacity-50",
      )}
    >
      <div className="text-center shrink-0 w-[52px]">
        <p className={cn("text-[15px] font-semibold tabular-nums", cancelled ? "text-muted line-through" : "text-fg")}>
          {timeOnly(a.starts_at, TZ)}
        </p>
        <p className="text-[10px] text-muted tabular-nums">{timeOnly(a.ends_at, TZ)}</p>
      </div>

      <div className="w-px self-stretch bg-secondary-transparent" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold text-fg truncate">
            {a.services?.name || p.deletedService}
          </span>
          <Badge className={STATUS_STYLES[a.status] || "bg-muted/10 text-muted"}>
            {p.status[a.status] || a.status}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1 truncate">
            <UserRoundIcon className="size-3 shrink-0" />
            {a.customer_name || p.noName}
          </span>
          {a.customer_contact && (
            <span className="inline-flex items-center gap-1 truncate">
              <PhoneIcon className="size-3 shrink-0" />
              {a.customer_contact}
            </span>
          )}
          {a.staff?.name && <span>· {a.staff.icon} {a.staff.name}</span>}
        </div>
        {a.note && <p className="text-[11px] text-secondary mt-1 truncate">{a.note}</p>}
      </div>

      <span className="text-[13px] font-semibold text-fg shrink-0">{money(a.price, a.currency)}</span>

      <NativeSelect
        value={a.status}
        onChange={(e) => setStatus(e.target.value)}
        className="w-[140px] shrink-0"
        size="sm"
      >
        {["booked", "confirmed", "completed", "cancelled", "no_show"].map((s) => (
          <NativeSelectOption key={s} value={s}>
            {p.status[s]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

function NewBookingDialog({ p, res, day, services, staff, onClose }) {
  const [form, setForm] = useState({
    serviceId: services?.[0]?.id || "",
    date: day,
    staffId: "",
    slot: "",
    customerName: "",
    customerContact: "",
  });

  const create = useCreateAppointment();
  const { data: slots, isLoading: loadingSlots } = useAvailability({
    serviceId: form.serviceId,
    date: form.date,
    staffId: form.staffId || undefined,
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v, ...(k === "serviceId" || k === "date" || k === "staffId" ? { slot: "" } : {}) }));

  function save(e) {
    e.preventDefault();
    if (!form.serviceId) return showError(p.errors.pickService);
    if (!form.slot) return showError(p.errors.pickSlot);
    if (!form.customerName.trim()) return showError(p.errors.needName);

    create.mutate(
      {
        serviceId: form.serviceId,
        startsAt: form.slot,
        staffId: form.staffId || null,
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

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{p.addBooking}</DialogTitle>
        </DialogHeader>

        <form onSubmit={save} className="px-6 pb-2 space-y-4">
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
            <Field label={p.fields.staff} className="flex-1">
              <NativeSelect value={form.staffId} onChange={(e) => set("staffId", e.target.value)}>
                <NativeSelectOption value="">{p.fields.anyStaff}</NativeSelectOption>
                {staff?.filter((s) => s.active).map((s) => (
                  <NativeSelectOption key={s.id} value={s.id}>
                    {s.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <Field label={p.fields.time}>
            {loadingSlots ? (
              <div className="py-3 text-[12px] text-muted flex items-center gap-2">
                <LoaderIcon className="size-3.5 animate-spin" />
                {p.fields.loadingSlots}
              </div>
            ) : !slots?.length ? (
              <p className="py-3 text-[12px] text-muted">{p.fields.noSlots}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto scrollbar-none">
                {slots.map((s) => (
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
                  >
                    {timeOnly(s.slot_start, TZ)}
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
