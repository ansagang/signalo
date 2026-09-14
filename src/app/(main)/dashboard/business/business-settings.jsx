"use client";

import { useEffect, useState } from "react";
import {
  useBusinessHours, useSaveBusinessHours,
  useStaff, useCreateStaff, useUpdateStaff, useDeleteStaff,
  useStaffHours, useSaveStaffHours,
} from "@/hooks/use-catalogue";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Section, Panel, Loading, Hint, EmptyState } from "@/components/ui/page";
import {
  ChevronDownIcon, ClockIcon, LoaderIcon, PlusIcon, Trash2Icon, UsersIcon,
} from "lucide-react";

/** One week of open/closed + from/to rows. Used for the shop and each master. */
function WeekEditor({ rows, onChange, dayNames, labels }) {
  const set = (weekday, key, value) =>
    onChange(rows.map((r) => (r.weekday === weekday ? { ...r, [key]: value } : r)));

  return (
    <div className="divide-y divide-[var(--color-secondary-transparent)]">
      {rows.map((row) => (
        <div key={row.weekday} className="flex items-center gap-3 px-4 py-2.5">
          <span className={cn("text-[13px] w-[92px] shrink-0", row.off ? "text-muted" : "text-fg")}>
            {dayNames[row.weekday]}
          </span>

          <label className="flex items-center gap-2 cursor-pointer shrink-0 w-[92px]">
            <input
              type="checkbox"
              checked={!row.off}
              onChange={(e) => set(row.weekday, "off", !e.target.checked)}
              className="size-4 accent-[var(--color-accent)] cursor-pointer"
            />
            <span className="text-[11px] text-muted">{row.off ? labels.closed : labels.open}</span>
          </label>

          {row.off ? (
            <span className="text-[12px] text-muted">{labels.closedAllDay}</span>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={row.from}
                onChange={(e) => set(row.weekday, "from", e.target.value)}
                className="w-[112px]"
              />
              <span className="text-muted text-[12px]">—</span>
              <Input
                type="time"
                value={row.to}
                onChange={(e) => set(row.weekday, "to", e.target.value)}
                className="w-[112px]"
              />
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
        <WeekEditor rows={rows} onChange={setRows} dayNames={dayNames} labels={p.hours} />
      </Panel>
    </Section>
  );
}

function Team({ p, res, dayNames }) {
  const { data: staff, isLoading } = useStaff();
  const create = useCreateStaff();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [openId, setOpenId] = useState(null);

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

function StaffRow({ member, p, res, dayNames, open, onToggle }) {
  const update = useUpdateStaff();
  const remove = useDeleteStaff();
  const { data: hours, isLoading } = useStaffHours(open ? member.id : null);
  const saveHours = useSaveStaffHours();
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
        <span className="text-[17px]">{member.icon || "💫"}</span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-fg truncate">{member.name}</span>
            {!member.active && <Badge className="bg-muted/10 text-muted">{p.team.inactive}</Badge>}
          </div>
          {member.role_title && <p className="text-[11px] text-muted">{member.role_title}</p>}
        </div>

        <button
          onClick={onToggle}
          className="text-[11px] text-secondary hover:text-fg transition-colors cursor-pointer px-2 py-1 inline-flex items-center gap-1"
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
          className="text-[11px] text-secondary hover:text-fg transition-colors cursor-pointer px-2 py-1"
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
          className="size-7 grid place-items-center rounded-button text-muted hover:text-error hover:bg-error/10 cursor-pointer"
        >
          <Trash2Icon className="size-3.5" />
        </button>
      </div>

      {open && (
        <div className="border-t border-secondary-transparent">
          <div className="px-4 pt-3">
            <Hint>{p.team.shiftsHelp}</Hint>
          </div>
          {isLoading ? (
            <Loading className="py-8" />
          ) : (
            <>
              <WeekEditor rows={rows} onChange={setRows} dayNames={dayNames} labels={p.hours} />
              <div className="px-4 py-3 border-t border-secondary-transparent">
                <Button
                  size="sm"
                  disabled={saveHours.isPending}
                  onClick={() =>
                    saveHours.mutate(
                      {
                        staffId: member.id,
                        rows: rows.map((r) => ({
                          weekday: r.weekday, starts_at: r.from, ends_at: r.to, off: r.off,
                        })),
                      },
                      {
                        onSuccess: (x) =>
                          x?.success === false ? showError(x.message) : showSuccess(res.hoursSaved),
                        onError: () => showError(res.hoursSaveError),
                      },
                    )
                  }
                >
                  {saveHours.isPending ? <LoaderIcon className="size-3.5 animate-spin" /> : p.team.saveShifts}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
