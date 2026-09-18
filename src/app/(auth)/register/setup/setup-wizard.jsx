"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analyseSite, applySetup } from "@/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Panel, Hint, EmptyState } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { money } from "@/lib/display";
import { showError, showSuccess } from "@/lib/toast";
import {
  ArrowRightIcon, CheckIcon, ClockIcon, ExternalLinkIcon, GlobeIcon, LoaderIcon,
  MessageSquareIcon, PackageIcon, SearchIcon, SparklesIcon, WrenchIcon,
} from "lucide-react";
import Link from "next/link";

/**
 * One colour identity per category, reused everywhere it appears on this
 * page — the "we'll look for" bullets, the group headers, the summary chips.
 * Repeating the same icon and tint each time is what makes the three views
 * read as one page instead of three unrelated ones.
 */
const GROUP_STYLE = {
  hours: { icon: ClockIcon, color: "text-warning", bg: "bg-warning/10" },
  services: { icon: WrenchIcon, color: "text-success", bg: "bg-success/10" },
  products: { icon: PackageIcon, color: "text-info", bg: "bg-info/10" },
  faqs: { icon: MessageSquareIcon, color: "text-purple-500", bg: "bg-purple-500/10" },
};

function IconChip({ tone, className }) {
  const { icon: Icon, color, bg } = GROUP_STYLE[tone];
  return (
    <span className={cn("size-7 rounded-full grid place-items-center shrink-0", bg, className)}>
      <Icon className={cn("size-3.5", color)} />
    </span>
  );
}

/** A found item the seller can drop before anything is written. */
function Pick({ checked, onToggle, children }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="group relative w-full flex items-start gap-3 pl-4 pr-4 py-3.5 text-left hover:bg-hover transition-colors cursor-pointer"
    >
      {/* A rail, not just the checkbox, says "kept" at a glance while
          scanning a long list — the same signal the bookings board and the
          inbox use for status. */}
      <span
        className={cn(
          "absolute left-0 top-0 bottom-0 w-[2.5px] rounded-r-full transition-opacity",
          checked ? "bg-accent opacity-100" : "opacity-0",
        )}
      />
      <span
        className={cn(
          "size-5 rounded-[7px] border-[1.5px] grid place-items-center shrink-0 mt-0.5 transition-colors",
          checked
            ? "bg-accent border-accent"
            : "border-border group-hover:border-accent/50",
        )}
      >
        {checked && <CheckIcon className="size-3.5 text-primary" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

function Group({ tone, title, count, allSelected, onSelectAll, onClearAll, labels, children }) {
  if (!count) return null;
  // Opening hours is a single toggle, not a list — "select all" means
  // nothing there, so the control only appears where there is something to
  // bulk-act on.
  const bulk = onSelectAll && onClearAll;
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-2.5">
        <IconChip tone={tone} />
        <p className="text-[13px] font-medium text-fg">{title}</p>
        <Badge className="bg-secondary-transparent2 text-secondary">{count}</Badge>
        {bulk && (
          <button
            type="button"
            onClick={allSelected ? onClearAll : onSelectAll}
            className="ml-auto text-[12px] text-secondary hover:text-fg transition-colors cursor-pointer"
          >
            {allSelected ? labels.clearAll : labels.selectAll}
          </button>
        )}
      </div>
      <Panel className="divide-y divide-[var(--color-secondary-transparent)]">{children}</Panel>
    </div>
  );
}

/** What this page will pull in, shown before anyone commits to reading a site. */
function ExpectRow({ p }) {
  const items = ["hours", "services", "products", "faqs"];
  return (
    <div className="mt-6">
      <p className="text-[11px] font-mono uppercase tracking-wider text-muted mb-2.5">{p.expectLabel}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((key) => (
          <span
            key={key}
            className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-secondary-transparent2 text-[12px] text-secondary"
          >
            <IconChip tone={key} className="size-5" />
            {p.groups[key]}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SetupWizard({ language, days }) {
  const p = language.app.pages.setup;
  const router = useRouter();

  const [url, setUrl] = useState("");
  const [found, setFound] = useState(null);
  const [keep, setKeep] = useState({ services: [], products: [], faqs: [], hours: true });
  const [reading, startRead] = useTransition();
  const [saving, startSave] = useTransition();

  function read() {
    if (!url.trim()) return showError(p.needUrl);
    startRead(async () => {
      const res = await analyseSite(url.trim());
      if (res?.success === false) return showError(res.message);
      setFound(res);
      // Everything found starts selected; dropping is easier than choosing.
      setKeep({
        services: res.data.services.map((_, i) => i),
        products: res.data.products.map((_, i) => i),
        faqs: res.data.faqs.map((_, i) => i),
        hours: res.data.hours.length > 0,
      });
    });
  }

  const toggle = (group, i) =>
    setKeep((k) => ({
      ...k,
      [group]: k[group].includes(i) ? k[group].filter((x) => x !== i) : [...k[group], i],
    }));

  const selectAll = (group, ids) => setKeep((k) => ({ ...k, [group]: ids }));
  const clearAll = (group) => setKeep((k) => ({ ...k, [group]: [] }));

  function save() {
    const d = found.data;
    const chosen = {
      business: d.business,
      hours: keep.hours ? d.hours : [],
      services: d.services.filter((_, i) => keep.services.includes(i)),
      products: d.products.filter((_, i) => keep.products.includes(i)),
      faqs: d.faqs.filter((_, i) => keep.faqs.includes(i)),
    };

    startSave(async () => {
      const res = await applySetup(chosen);
      if (res?.success === false) return showError(res.message);
      const { made } = res;
      showSuccess(
        p.saved
          .replace("{services}", made.services)
          .replace("{products}", made.products)
          .replace("{faqs}", made.faqs),
      );
      router.push("/dashboard/catalogue");
    });
  }

  const total =
    keep.services.length + keep.products.length + keep.faqs.length + (keep.hours ? 1 : 0);

  if (!found) {
    return (
      <div className="max-w-[560px] max-h-full">
        <Panel className="p-6">
          <div className="size-11 rounded-full bg-secondary-transparent2 grid place-items-center mb-5">
            <GlobeIcon className="size-5 text-accent" />
          </div>

          <Field label={p.urlLabel}>
            <Input
              variant="filled"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="yourshop.kz"
              autoFocus
              disabled={reading}
              onKeyDown={(e) => e.key === "Enter" && !reading && read()}
            />
          </Field>
          <Hint className="mt-2">{p.urlHelp}</Hint>

          <Button size="lg" className="mt-5 w-full" onClick={read} disabled={reading || !url.trim()}>
            {reading ? <LoaderIcon className="size-4 animate-spin" /> : <GlobeIcon className="size-4" />}
            {reading ? p.reading : p.read}
          </Button>

          {reading && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-button bg-secondary-transparent2">
              <SearchIcon className="size-3.5 text-muted animate-pulse shrink-0" />
              <Hint>{p.readingHelp}</Hint>
            </div>
          )}

          <ExpectRow p={p} />
        </Panel>

        <p className="text-[13px] text-secondary text-center mt-5">
          <Link href="/dashboard" className="text-accent hover:underline">{p.skip}</Link>
        </p>
      </div>
    );
  }

  const d = found.data;
  const nothingFound = !d.services.length && !d.products.length && !d.faqs.length && !d.hours.length;

  const chips = [
    d.hours.length > 0 && { key: "hours", label: p.groups.hours, count: 1 },
    d.services.length > 0 && { key: "services", label: p.groups.services, count: d.services.length },
    d.products.length > 0 && { key: "products", label: p.groups.products, count: d.products.length },
    d.faqs.length > 0 && { key: "faqs", label: p.groups.faqs, count: d.faqs.length },
  ].filter(Boolean);

  return (
    <div className="max-w-[640px] space-y-6 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-none">
      <Panel className="p-5 bg-info/5 border-info/25">
        <div className="flex items-start gap-3">
          <span className="size-8 rounded-full bg-info/10 grid place-items-center shrink-0">
            <SparklesIcon className="size-4 text-info" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-fg mb-1">
              {p.foundOn.replace("{title}", d.business.name || found.title)}
            </p>
            <Hint>{p.checkIt}</Hint>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3.5 pt-3.5 border-t border-info/15">
            {chips.map((c) => (
              <span
                key={c.key}
                className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-card border border-secondary-transparent text-[11px] text-secondary"
              >
                <IconChip tone={c.key} className="size-5" />
                {c.label}
                {c.key !== "hours" && <span className="text-muted tabular-nums">{c.count}</span>}
              </span>
            ))}
          </div>
        )}

        <a
          href={found.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-muted hover:text-fg transition-colors truncate max-w-full"
        >
          <ExternalLinkIcon className="size-3 shrink-0" />
          <span className="truncate">{found.pages.join(" · ")}</span>
        </a>
      </Panel>

      {nothingFound && (
        <EmptyState
          icon={SearchIcon}
          title={p.nothing.title}
          description={p.nothing.body}
          action={
            <Button variant="outline" onClick={() => setFound(null)}>
              {p.tryAnother}
            </Button>
          }
        />
      )}

      {d.hours.length > 0 && (
        <Group tone="hours" title={p.groups.hours} count={1} labels={p}>
          <Pick checked={keep.hours} onToggle={() => setKeep((k) => ({ ...k, hours: !k.hours }))}>
            <span className="text-[13px] text-fg">
              {d.hours
                .filter((h) => !h.closed)
                .map((h) => `${days[h.weekday].slice(0, 2)} ${h.opens}–${h.closes}`)
                .join(" · ") || p.groups.allClosed}
            </span>
          </Pick>
        </Group>
      )}

      <Group
        tone="services"
        title={p.groups.services}
        count={d.services.length}
        allSelected={keep.services.length === d.services.length}
        onSelectAll={() => selectAll("services", d.services.map((_, i) => i))}
        onClearAll={() => clearAll("services")}
        labels={p}
      >
        {d.services.map((s, i) => (
          <Pick key={i} checked={keep.services.includes(i)} onToggle={() => toggle("services", i)}>
            <span className="flex items-center gap-2">
              <span className="text-[13px] text-fg truncate">{s.name}</span>
              <span className="ml-auto flex items-center gap-1.5 shrink-0">
                {s.duration_min && (
                  <span className="text-[11px] text-muted tabular-nums">{s.duration_min} min</span>
                )}
                <span className="text-[12px] font-medium text-fg tabular-nums px-2 py-0.5 rounded-full bg-secondary-transparent2">
                  {money(s.price, "kzt")}
                </span>
              </span>
            </span>
            {s.description && (
              <span className="block text-[12px] text-secondary mt-1 line-clamp-1">{s.description}</span>
            )}
          </Pick>
        ))}
      </Group>

      <Group
        tone="products"
        title={p.groups.products}
        count={d.products.length}
        allSelected={keep.products.length === d.products.length}
        onSelectAll={() => selectAll("products", d.products.map((_, i) => i))}
        onClearAll={() => clearAll("products")}
        labels={p}
      >
        {d.products.map((x, i) => (
          <Pick key={i} checked={keep.products.includes(i)} onToggle={() => toggle("products", i)}>
            <span className="flex items-center gap-2">
              <span className="text-[13px] text-fg truncate">{x.name}</span>
              <span className="text-[12px] font-medium text-fg ml-auto shrink-0 tabular-nums px-2 py-0.5 rounded-full bg-secondary-transparent2">
                {money(x.price, "kzt")}
              </span>
            </span>
          </Pick>
        ))}
      </Group>

      <Group
        tone="faqs"
        title={p.groups.faqs}
        count={d.faqs.length}
        allSelected={keep.faqs.length === d.faqs.length}
        onSelectAll={() => selectAll("faqs", d.faqs.map((_, i) => i))}
        onClearAll={() => clearAll("faqs")}
        labels={p}
      >
        {d.faqs.map((f, i) => (
          <Pick key={i} checked={keep.faqs.includes(i)} onToggle={() => toggle("faqs", i)}>
            <span className="block text-[13px] text-fg">{f.title}</span>
            <span className="block text-[12px] text-secondary mt-0.5 line-clamp-2">{f.content}</span>
          </Pick>
        ))}
      </Group>

      {/* A fading wash rather than a hard line, so the bar reads as fixed
          furniture rather than as a stray card cutting off the last row. */}
      <div className="sticky z-50 bottom-0 -mx-1 px-1 pt-15 bg-linear-to-t from-bg via-bg to-transparent">
        <div className="flex items-center flex-col gap-4 flex-wrap border-secondary-transparent pt-4 pb-1">
          <Button className={'w-full'} size="lg" onClick={save} disabled={saving || total === 0}>
            {saving ? <LoaderIcon className="size-4 animate-spin" /> : <ArrowRightIcon className="size-4" />}
            {p.apply.replace("{n}", total)}
          </Button>
          <button
            type="button"
            onClick={() => setFound(null)}
            className="text-[13px] text-secondary hover:text-fg transition-colors cursor-pointer"
          >
            {p.tryAnother}
          </button>
        </div>
      </div>
    </div>
  );
}
