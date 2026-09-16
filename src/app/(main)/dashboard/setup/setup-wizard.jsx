"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analyseSite, applySetup } from "@/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Panel, Hint, Section } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { money } from "@/lib/display";
import { showError, showSuccess } from "@/lib/toast";
import {
  ArrowRightIcon, CheckIcon, ClockIcon, GlobeIcon, LoaderIcon,
  MessageSquareIcon, PackageIcon, SparklesIcon,
} from "lucide-react";

/** A found item the seller can drop before anything is written. */
function Pick({ checked, onToggle, children }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-hover transition-colors cursor-pointer"
    >
      <span
        className={cn(
          "size-4 rounded-[5px] border grid place-items-center shrink-0 mt-0.5 transition-colors",
          checked ? "bg-accent border-accent" : "border-border",
        )}
      >
        {checked && <CheckIcon className="size-3 text-primary" />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

function Group({ icon: Icon, title, count, children }) {
  if (!count) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="size-3.5 text-muted" />
        <p className="text-[13px] font-medium text-fg">{title}</p>
        <Badge className="bg-secondary-transparent2 text-secondary">{count}</Badge>
      </div>
      <Panel className="divide-y divide-[var(--color-secondary-transparent)]">{children}</Panel>
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
      <div className="max-w-[560px]">
        <Panel className="p-6">
          <Field label={p.urlLabel}>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="yourshop.kz"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && !reading && read()}
            />
          </Field>
          <Hint className="mt-2">{p.urlHelp}</Hint>
          <Button className="mt-5" onClick={read} disabled={reading || !url.trim()}>
            {reading ? <LoaderIcon className="size-4 animate-spin" /> : <GlobeIcon className="size-4" />}
            {reading ? p.reading : p.read}
          </Button>
          {reading && <Hint className="mt-3">{p.readingHelp}</Hint>}
        </Panel>

        <button
          type="button"
          onClick={() => router.push("/dashboard/catalogue")}
          className="mt-4 text-[13px] text-secondary hover:text-fg transition-colors cursor-pointer"
        >
          {p.skip}
        </button>
      </div>
    );
  }

  const d = found.data;

  return (
    <div className="space-y-6">
      <Panel className="p-4 flex items-start gap-3 bg-info/5 border-info/25">
        <SparklesIcon className="size-4 text-info shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-fg mb-1">
            {p.foundOn.replace("{title}", d.business.name || found.title)}
          </p>
          <Hint>{p.checkIt}</Hint>
          <p className="text-[11px] text-muted mt-1.5 truncate">{found.pages.join(" · ")}</p>
        </div>
      </Panel>

      {total === 0 && !d.services.length && !d.products.length && !d.faqs.length && !d.hours.length && (
        <Panel className="p-6 text-center">
          <p className="text-[14px] text-fg mb-1.5">{p.nothing.title}</p>
          <Hint className="max-w-[52ch] mx-auto">{p.nothing.body}</Hint>
        </Panel>
      )}

      {d.hours.length > 0 && (
        <Group icon={ClockIcon} title={p.groups.hours} count={1}>
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

      <Group icon={SparklesIcon} title={p.groups.services} count={d.services.length}>
        {d.services.map((s, i) => (
          <Pick key={i} checked={keep.services.includes(i)} onToggle={() => toggle("services", i)}>
            <span className="flex items-baseline gap-2">
              <span className="text-[13px] text-fg truncate">{s.name}</span>
              <span className="text-[12px] text-muted shrink-0">{s.duration_min} min</span>
              <span className="text-[13px] text-fg ml-auto shrink-0">{money(s.price, "kzt")}</span>
            </span>
            {s.description && (
              <span className="block text-[12px] text-secondary mt-0.5 line-clamp-1">{s.description}</span>
            )}
          </Pick>
        ))}
      </Group>

      <Group icon={PackageIcon} title={p.groups.products} count={d.products.length}>
        {d.products.map((x, i) => (
          <Pick key={i} checked={keep.products.includes(i)} onToggle={() => toggle("products", i)}>
            <span className="flex items-baseline gap-2">
              <span className="text-[13px] text-fg truncate">{x.name}</span>
              <span className="text-[13px] text-fg ml-auto shrink-0">{money(x.price, "kzt")}</span>
            </span>
          </Pick>
        ))}
      </Group>

      <Group icon={MessageSquareIcon} title={p.groups.faqs} count={d.faqs.length}>
        {d.faqs.map((f, i) => (
          <Pick key={i} checked={keep.faqs.includes(i)} onToggle={() => toggle("faqs", i)}>
            <span className="block text-[13px] text-fg">{f.title}</span>
            <span className="block text-[12px] text-secondary mt-0.5 line-clamp-2">{f.content}</span>
          </Pick>
        ))}
      </Group>

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={save} disabled={saving || total === 0}>
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
  );
}
