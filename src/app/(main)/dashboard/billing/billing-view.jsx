"use client";

import { cn } from "@/lib/utils";
import { Panel, Section, Hint, EmptyState } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangleIcon, CoinsIcon, GaugeIcon, MessageSquareIcon, WalletIcon,
} from "lucide-react";

const nf = new Intl.NumberFormat("en-US");
const credits = (n) => nf.format(Math.round((Number(n) || 0) * 100) / 100);

/** One headline number. */
function Stat({ icon: Icon, label, value, sub, tone }) {
  return (
    <Panel className="p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("size-4", tone || "text-muted")} />
        <p className="text-[12px] text-secondary">{label}</p>
      </div>
      <p className={cn("text-[26px] font-semibold tracking-[-0.02em] leading-none", tone || "text-fg")}>
        {value}
      </p>
      {sub && <p className="text-[12px] text-muted mt-1.5">{sub}</p>}
    </Panel>
  );
}

/** Usage per day. Bars beat a chart library for one series. */
function Bars({ perDay, label }) {
  const peak = Math.max(...perDay.map((d) => d.credits), 1);
  return (
    <Panel className="p-5">
      <p className="text-[13px] font-medium text-fg mb-4">{label}</p>
      <div className="flex items-end gap-[3px] h-[120px]">
        {perDay.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${credits(d.credits)}`}
            className="flex-1 min-w-0 rounded-[2px] bg-accent/70 hover:bg-accent transition-colors"
            // A day with usage never renders as nothing at all.
            style={{ height: `${d.credits ? Math.max((d.credits / peak) * 100, 3) : 1}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[11px] text-muted font-mono">
        <span>{perDay[0]?.day.slice(5)}</span>
        <span>{perDay[perDay.length - 1]?.day.slice(5)}</span>
      </div>
    </Panel>
  );
}

/** Where the credits went. */
function Split({ title, rows, total, empty }) {
  return (
    <Panel className="p-5">
      <p className="text-[13px] font-medium text-fg mb-3">{title}</p>
      {!rows.length ? (
        <Hint>{empty}</Hint>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.key}>
              <div className="flex items-baseline gap-2 text-[12px] mb-1">
                <span className="text-fg truncate">{r.key}</span>
                <span className="text-muted ml-auto shrink-0 font-mono tabular-nums">
                  {credits(r.credits)}
                </span>
              </div>
              <div className="h-1 rounded-full bg-secondary-transparent2 overflow-hidden">
                <div
                  className="h-full bg-accent/60"
                  style={{ width: `${total > 0 ? (r.credits / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function BillingView({ language, data }) {
  const p = language.app.pages.billing;

  if (!data) return <EmptyState icon={WalletIcon} title={p.empty.title} description={p.empty.subtitle} />;

  const when = (iso) =>
    new Intl.DateTimeFormat(language.lang === "en" ? "en-GB" : language.lang, {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(iso));

  return (
    <div className="space-y-8">
      {data.lowBalance && (
        <Panel className="p-4 flex items-start gap-3 bg-warning/5 border-warning/30">
          <AlertTriangleIcon className="size-4 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-medium text-fg mb-1">{p.low.title}</p>
            <Hint>{p.low.body}</Hint>
          </div>
        </Panel>
      )}

      <div className="grid gap-3 tablet:grid-cols-2 laptop:grid-cols-4">
        <Stat
          icon={WalletIcon}
          label={p.stats.balance}
          value={credits(data.balance)}
          sub={p.stats.balanceSub.replace("{money}", `$${data.money.toFixed(2)}`)}
          tone={data.lowBalance ? "text-warning" : undefined}
        />
        <Stat
          icon={CoinsIcon}
          label={p.stats.spent.replace("{days}", data.days)}
          value={credits(data.spent)}
          sub={p.stats.spentSub.replace("{n}", nf.format(data.calls))}
        />
        <Stat
          icon={MessageSquareIcon}
          label={p.stats.tokens}
          value={nf.format(data.inputTokens + data.outputTokens)}
          sub={p.stats.tokensSub
            .replace("{in}", nf.format(data.inputTokens))
            .replace("{out}", nf.format(data.outputTokens))}
        />
        <Stat
          icon={GaugeIcon}
          label={p.stats.runway}
          value={data.daysLeft === null ? "—" : nf.format(data.daysLeft)}
          sub={data.daysLeft === null ? p.stats.runwayNone : p.stats.runwaySub}
        />
      </div>

      <Bars perDay={data.perDay} label={p.chart.replace("{days}", data.days)} />

      <div className="grid gap-3 tablet:grid-cols-2">
        <Split title={p.byChannel} rows={data.byChannel} total={data.spent} empty={p.noUsage} />
        <Split title={p.byModel} rows={data.byModel} total={data.spent} empty={p.noUsage} />
      </div>

      <Section title={p.history.title} description={p.history.subtitle}>
        {!data.transactions.length ? (
          <EmptyState icon={CoinsIcon} title={p.noUsage} description={p.history.empty} />
        ) : (
          <Panel className="divide-y divide-[var(--color-secondary-transparent)]">
            {data.transactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 px-4 py-2.5">
                <Badge
                  className={cn(
                    "shrink-0",
                    Number(tx.delta) > 0 ? "bg-success/10 text-success" : "bg-secondary-transparent2 text-secondary",
                  )}
                >
                  {p.reasons[tx.reason] || tx.reason}
                </Badge>
                <span className="text-[12px] text-muted truncate">{tx.note || ""}</span>
                <span className="text-[12px] text-muted ml-auto shrink-0">{when(tx.created_at)}</span>
                <span
                  className={cn(
                    "text-[13px] font-mono tabular-nums shrink-0 w-[92px] text-right",
                    Number(tx.delta) > 0 ? "text-success" : "text-fg",
                  )}
                >
                  {Number(tx.delta) > 0 ? "+" : ""}{credits(tx.delta)}
                </span>
              </div>
            ))}
          </Panel>
        )}
      </Section>
    </div>
  );
}
