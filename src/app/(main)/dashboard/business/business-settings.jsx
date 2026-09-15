"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useBusinessHours, useSaveBusinessHours,
  useStaff, useCreateStaff, useUpdateStaff, useDeleteStaff,
  useStaffHours, useSaveStaffHours,
  useServices, useServiceStaffMap, useSetStaffServices,
} from "@/hooks/use-catalogue";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Section, Panel, Loading, Hint, EmptyState } from "@/components/ui/page";
import {
  ChevronDownIcon, ClockIcon, CopyIcon, InfoIcon, LoaderIcon,
  PlusIcon, Trash2Icon, UsersIcon,
} from "lucide-react";

/** "Mon–Sat, 10:00–20:00" / "Closed" — a week summarised in one line. */
function summarise(rows, names, labels) {
  const open = rows.filter((r) => !r.off);
  if (!open.length) return labels.closedAllWeek;

  const sameTimes = open.every((r) => r.from === open[0].from && r.to === open[0].to);
  const short = (wd) => names[wd].slice(0, 3);

  // Contiguous runs of open days read better than a list.
  const runs = [];
  for (const r of open.sort((a, b) => a.weekday - b.weekday)) {
    const last = runs[runs.length - 1];
    if (last && r.weekday === last[1] + 1) last[1] = r.weekday;
    else runs.push([r.weekday, r.weekday]);
  }
  const days = runs
    .map(([a, b]) => (a === b ? short(a) : `${short(a)}–${short(b)}`))
    .join(", ");

  return sameTimes ? `${days}, ${open[0].from}–${open[0].to}` : days;
}

function WeekEditor({ rows, onChange, dayNames, labels, compact }) {
  const set = (weekday, key, value) =>
    onChange(rows.map((r) => (r.weekday === weekday ? { ...r, [key]: value } : r)));

  // Most shops keep one schedule all week; typing it seven times is busywork.
  function copyDown(from) {
    const source = rows.find((r) => r.weekday === from);
    onChange(rows.map((r) => (r.off ? r : { ...r, from: source.from, to: source.to })));
  }

  return (
    <div className="divide-y divide-[var(--color-secondary-transparent)]">
      {rows.map((row) => (
        <div key={row.weekday} className="flex items-center gap-3 px-4 py-2.5 group">
          <span className={cn("text-[13px] w-[96px] shrink-0", row.off ? "text-muted" : "text-fg")}>
            {dayNames[row.weekday]}
          </span>

          <label className="flex items-center gap-2 cursor-pointer shrink-0 w-[86px]">
            <input
              type="checkbox"
              checked={!row.off}
              onChange={(e) => set(row.weekday, "off", !e.target.checked)}
              className="size-4 accent-[var(--color-accent)] cursor-pointer"
            />
            <span className="text-[12px] text-secondary">{row.off ? labels.closed : labels.open}</span>
          </label>

          {row.off ? (
            <span className="text-[12px] text-muted">{labels.closedAllDay}</span>
          ) : (
            <div className="flex items-center gap-2">
              <Input type="time" value={row.from} onChange={(e) => set(row.weekday, "from", e.target.value)} className="w-[116px]" />
              <span className="text-muted text-[12px]">—</span>
              <Input type="time" value={row.to} onChange={(e) => set(row.weekday, "to", e.target.value)} className="w-[116px]" />
              {!compact && (
                <button
                  type="button"
                  onClick={() => copyDown(row.weekday)}
                  title={labels.copyToAll}
                  className="size-7 grid place-items-center rounded-button text-muted hover:text-fg hover:bg-hover opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <CopyIcon className="size-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function BusinessSettings({ language }) {
  const p = language.app.pages.business;
  const res = language.app.res;
  const dayNames = language.app.global.weekdaysFull;

  return (
    <>
      <Panel className="mb-8 p-4 flex items-start gap-3 bg-info/5 border-info/25">
        <InfoIcon className="size-4 text-info shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] text-fg font-medium mb-1">{p.explain.title}</p>
          <Hint>{p.explain.body}</Hint>
        </div>
      </Panel>

      <ShopHours p={p} res={res} dayNames={dayNames} />
      <Team p={p} res={res} dayNames={dayNames} />
    </>
  );
}

function ShopHours({ p, res, dayNames }) {
  const { data: hours, isLoading } = useBusinessHours();
  const save = useSaveBusinessHours();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (hours) {
      setRows(hours.map((h) => ({
        weekday: h.weekday,
        from: h.opens?.slice(0, 5),
        to: h.closes?.slice(0, 5),
        off: h.closed,
      })));
    }
  }, [hours]);

  if (isLoading) return <Loading />;

  const summary = rows.length ? summarise(rows, dayNames, p.hours) : "";

  return (
    <Section
      title={p.hours.title}
      description={p.hours.subtitle}
      icon={ClockIcon}
      actions={
        <Button
          size="sm"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              rows.map((r) => ({ weekday: r.weekday, opens: r.from, closes: r.to, closed: r.off })),
              {
                onSuccess: (x) => (x?.success === false ? showError(x.message) : showSuccess(res.hoursSaved)),
                onError: () => showError(res.hoursSaveError),
              },
            )
          }
        >
          {save.isPending ? <LoaderIcon className="size-3.5 animate-spin" /> : p.hours.save}
        </Button>
      }
    >
      <Panel>
        <div className="px-4 py-2.5 border-b border-secondary-transparent flex items-center gap-2">
          <Badge className="bg-secondary-transparent2 text-secondary">{summary}</Badge>
          <Hint className="ml-auto hidden tablet:block">{p.hours.copyHint}</Hint>
        </div>
        <WeekEditor rows={rows} onChange={setRows} dayNames={dayNames} labels={p.hours} />
      </Panel>
    </Section>
  );
}

function Team({ p, res, dayNames }) {
  const { data: staff, isLoading } = useStaff();
  const { data: services } = useServices();
  const { data: staffMap } = useServiceStaffMap();
  const create = useCreateStaff();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [openId, setOpenId] = useState(null);

  // Invert service → masters into master → services, for the summary line.
  const servicesByStaff = useMemo(() => {
    const out = {};
    for (const [serviceId, ids] of Object.entries(staffMap || {})) {
      const service = (services || []).find((s) => s.id === serviceId);
      if (!service) continue;
      for (const id of ids) (out[id] ||= []).push(service.name);
    }
    return out;
  }, [staffMap, services]);

  function add(e) {
    e.preventDefault();
    if (!name.trim()) return showError(res.nameRequired);
    create.mutate(
      { name: name.trim(), role_title: role.trim() || null, icon: "💫" },
      {
        onSuccess: (r) => {
          if (r?.success === false) return showError(r.message);
          setName("");
          setRole("");
          showSuccess(res.staffCreated);
        },
        onError: () => showError(res.staffCreateError),
      },
    );
  }

  return (
    <Section title={p.team.title} description={p.team.subtitle} icon={UsersIcon}>
      {isLoading ? (
        <Loading />
      ) : !staff?.length ? (
        <EmptyState icon={UsersIcon} title={p.team.empty} description={p.team.emptyHint} />
      ) : (
        <div className="space-y-2">
          {staff.map((member) => (
            <StaffRow
              key={member.id}
              member={member}
              allServices={services || []}
              assignedIds={(services || []).filter((sv) => (staffMap?.[sv.id] || []).includes(member.id)).map((sv) => sv.id)}
              services={servicesByStaff[member.id] || []}
              p={p}
              res={res}
              dayNames={dayNames}
              open={openId === member.id}
              onToggle={() => setOpenId(openId === member.id ? null : member.id)}
            />
          ))}
        </div>
      )}

      <form onSubmit={add} className="flex gap-2 mt-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={p.team.namePlaceholder} className="flex-1" />
        <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder={p.team.rolePlaceholder} className="flex-1" />
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? <LoaderIcon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
          {p.team.add}
        </Button>
      </form>
    </Section>
  );
}

function StaffRow({ member, services, allServices, assignedIds, p, res, dayNames, open, onToggle }) {
  const update = useUpdateStaff();
  const remove = useDeleteStaff();
  const { data: hours, isLoading } = useStaffHours(open ? member.id : null);
  const saveHours = useSaveStaffHours();
  const setStaffServices = useSetStaffServices();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (hours) {
      setRows(hours.map((h) => ({
        weekday: h.weekday,
        from: h.starts_at?.slice(0, 5),
        to: h.ends_at?.slice(0, 5),
        off: h.off,
      })));
    }
  }, [hours]);

  return (
    <Panel>
      <div className="px-4 py-3 flex items-center gap-3">
        <span className="text-[19px] shrink-0">{member.icon || "💫"}</span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-fg truncate">{member.name}</span>
            {member.role_title && <span className="text-[12px] text-muted truncate">· {member.role_title}</span>}
            {!member.active && <Badge className="bg-muted/10 text-muted">{p.team.inactive}</Badge>}
          </div>
          {/* What this person can actually be booked for, without expanding. */}
          <p className="text-[12px] text-secondary truncate mt-0.5">
            {services.length ? services.join(", ") : p.team.noServices}
          </p>
        </div>

        <button
          onClick={onToggle}
          className="text-[12px] text-secondary hover:text-fg transition-colors cursor-pointer px-2 py-1 inline-flex items-center gap-1 shrink-0"
        >
          {p.team.shifts}
          <ChevronDownIcon className={cn("size-3 transition-transform", open && "rotate-180")} />
        </button>

        <button
          onClick={() =>
            update.mutate({ id: member.id, updates: { active: !member.active } }, {
              onError: () => showError(res.staffUpdateError),
            })
          }
          className="text-[12px] text-secondary hover:text-fg transition-colors cursor-pointer px-2 py-1 shrink-0"
        >
          {member.active ? p.team.deactivate : p.team.activate}
        </button>

        <button
          onClick={() =>
            remove.mutate(member.id, {
              onSuccess: () => showSuccess(res.staffDeleted),
              onError: () => showError(res.staffDeleteError),
            })
          }
          aria-label={p.team.remove}
          className="size-8 grid place-items-center rounded-button text-muted hover:text-error hover:bg-error/10 cursor-pointer shrink-0"
        >
          <Trash2Icon className="size-3.5" />
        </button>
      </div>

      {open && (
        <div className="border-t border-secondary-transparent">
          <div className="px-4 py-3 border-b border-secondary-transparent">
            <p className="text-[13px] font-medium text-fg mb-1">{p.team.canDo}</p>
            <Hint className="mb-2.5">{p.team.canDoHelp}</Hint>

            {!allServices.length ? (
              <Hint>{p.team.noServicesYet}</Hint>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {allServices.map((sv) => {
                  const on = assignedIds.includes(sv.id);
                  return (
                    <button
                      key={sv.id}
                      type="button"
                      disabled={setStaffServices.isPending}
                      onClick={() =>
                        setStaffServices.mutate(
                          {
                            staffId: member.id,
                            serviceIds: on
                              ? assignedIds.filter((x) => x !== sv.id)
                              : [...assignedIds, sv.id],
                          },
                          { onError: () => showError(res.staffUpdateError) },
                        )
                      }
                      className={cn(
                        "px-2.5 py-1.5 rounded-button text-[12px] font-medium transition-colors cursor-pointer disabled:opacity-50",
                        on ? "bg-fg text-primary" : "bg-secondary-transparent2 text-secondary hover:text-fg",
                      )}
                    >
                      {sv.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-4 pt-3 pb-1">
            <p className="text-[13px] font-medium text-fg mb-1">{p.team.shiftsTitle}</p>
            <Hint>{p.team.shiftsHelp}</Hint>
          </div>
          {isLoading ? (
            <Loading className="py-8" />
          ) : (
            <>
              <WeekEditor rows={rows} onChange={setRows} dayNames={dayNames} labels={p.hours} compact />
              <div className="px-4 py-3 border-t border-secondary-transparent flex items-center gap-3">
                <Button
                  size="sm"
                  disabled={saveHours.isPending}
                  onClick={() =>
                    saveHours.mutate(
                      {
                        staffId: member.id,
                        rows: rows.map((r) => ({ weekday: r.weekday, starts_at: r.from, ends_at: r.to, off: r.off })),
                      },
                      {
                        onSuccess: (x) => (x?.success === false ? showError(x.message) : showSuccess(res.hoursSaved)),
                        onError: () => showError(res.hoursSaveError),
                      },
                    )
                  }
                >
                  {saveHours.isPending ? <LoaderIcon className="size-3.5 animate-spin" /> : p.team.saveShifts}
                </Button>
                <Badge className="bg-secondary-transparent2 text-secondary">
                  {rows.length ? summarise(rows, dayNames, p.hours) : ""}
                </Badge>
              </div>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
