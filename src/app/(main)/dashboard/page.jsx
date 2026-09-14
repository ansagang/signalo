import { getUser } from "@/actions/auth";
import { getLanguage } from "@/lib/get-language";
import { getOverviewStats } from "@/actions/stats";
import { cn } from "@/lib/utils";
import { customerLabel, initialsFor, money, friendlyDate } from "@/lib/display";
import Link from "next/link";
import {
  MessageSquareIcon,
  PackageIcon,
  TrendingUpIcon,
  BotIcon,
  BookTextIcon,
  InboxIcon,
  ArrowRightIcon,
  UserRoundIcon,
  CalendarDaysIcon,
  TriangleAlertIcon,
  ClockIcon,
} from "lucide-react";

export async function generateMetadata() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });

  return {
    title: language.app.pages.overview.meta.title,
    description: language.app.pages.overview.meta.description,
  };
}

function Stat({ label, value, sub, icon: Icon, tone = "text-fg" }) {
  return (
    <div className="border border-border rounded-module bg-card px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-mono uppercase tracking-wider text-muted">{label}</span>
        <Icon className="size-3.5 text-muted" />
      </div>
      <p className={cn("text-[26px] font-bold leading-none tracking-tight", tone)}>{value}</p>
      {sub && <p className="text-[11px] text-muted mt-2">{sub}</p>}
    </div>
  );
}

export default async function OverviewPage() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });
  const p = language.app.pages.overview;
  // The proxy guards this route, so a session is expected — but a stale
  // cookie would otherwise crash the render on stats.entries.
  const stats = (await getOverviewStats()) || {
    conversations: 0, conversationsLast30: 0, handoffs: 0, autoResolveRate: null,
    orders: 0, ordersLast30: 0, revenue: 0, currency: "kzt",
    entries: 0, personas: 0, channels: 0, recent: [],
  };

  const setupSteps = [
    {
      done: stats.products + stats.services > 0,
      title: p.setup.catalogue,
      href: "/dashboard/catalogue",
      icon: BookTextIcon,
    },
    { done: stats.personas > 0, title: p.setup.persona, href: "/dashboard/personas", icon: BotIcon },
    { done: stats.channels > 0, title: p.setup.channel, href: "/dashboard/channels", icon: InboxIcon },
  ];
  const incomplete = setupSteps.filter((s) => !s.done);

  return (
    <div className="px-7 py-10">
      <div className="title">
        <h3>
          {p.greeting}
          {user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}
        </h3>
      </div>
      <div className="info-2">
        <p>{p.meta.description}</p>
      </div>

      {incomplete.length > 0 && (
        <div className="mt-8 border border-border rounded-module bg-card p-5">
          <p className="text-[13px] font-semibold text-fg mb-1">{p.setup.title}</p>
          <p className="text-[12px] text-muted mb-4">{p.setup.subtitle}</p>
          <div className="space-y-2">
            {setupSteps.map((step) => (
              <Link
                key={step.href}
                href={step.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-button border transition-colors",
                  step.done
                    ? "border-success/30 bg-success/5"
                    : "border-secondary-transparent hover:bg-hover",
                )}
              >
                <div
                  className={cn(
                    "size-5 rounded-full grid place-items-center text-[10px] shrink-0",
                    step.done ? "bg-success text-primary" : "bg-secondary-transparent2 text-muted",
                  )}
                >
                  {step.done ? "✓" : <step.icon className="size-3" />}
                </div>
                <span
                  className={cn(
                    "text-[13px] flex-1",
                    step.done ? "text-secondary line-through" : "text-fg",
                  )}
                >
                  {step.title}
                </span>
                {!step.done && <ArrowRightIcon className="size-3.5 text-muted" />}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 laptop-2:grid-cols-3 laptop:grid-cols-5 gap-3">
        <Stat
          label={p.stats.conversations}
          value={stats.conversations.toLocaleString()}
          sub={p.stats.last30.replace("{count}", stats.conversationsLast30)}
          icon={MessageSquareIcon}
        />
        <Stat
          label={p.stats.orders}
          value={stats.orders.toLocaleString()}
          sub={p.stats.last30.replace("{count}", stats.ordersLast30)}
          icon={PackageIcon}
        />
        <Stat
          label={p.stats.bookings}
          value={stats.bookings.toLocaleString()}
          sub={p.stats.last30.replace("{count}", stats.bookingsLast30)}
          icon={CalendarDaysIcon}
        />
        <Stat
          label={p.stats.revenue}
          value={money(stats.revenue, stats.currency)}
          sub={p.stats.revenueSub}
          icon={TrendingUpIcon}
          tone="text-success"
        />
        <Stat
          label={p.stats.autoResolve}
          value={stats.autoResolveRate === null ? "—" : `${stats.autoResolveRate}%`}
          sub={p.stats.handoffs.replace("{count}", stats.handoffs)}
          icon={UserRoundIcon}
        />
      </div>

      <div className="mt-8 grid gap-3 laptop-2:grid-cols-2">
        <div className="border border-border rounded-module bg-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-secondary-transparent flex items-center justify-between">
            <p className="text-[13px] font-semibold text-fg inline-flex items-center gap-2">
              <CalendarDaysIcon className="size-3.5 text-muted" />
              {p.todayBookings.title}
            </p>
            <Link href="/dashboard/bookings" className="text-[12px] text-secondary hover:text-fg transition-colors">
              {p.todayBookings.viewAll}
            </Link>
          </div>
          {!stats.todayBookings.length ? (
            <p className="px-5 py-8 text-center text-[12px] text-muted">{p.todayBookings.empty}</p>
          ) : (
            stats.todayBookings.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-secondary-transparent2 last:border-b-0">
                <span className="text-[12px] font-semibold text-fg tabular-nums shrink-0">
                  {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Almaty", hour: "2-digit", minute: "2-digit" }).format(new Date(b.starts_at))}
                </span>
                <span className="text-[12px] text-secondary truncate flex-1">{b.services?.name}</span>
                <span className="text-[11px] text-muted truncate max-w-[100px]">{b.customer_name}</span>
              </div>
            ))
          )}
        </div>

        <div className="border border-border rounded-module bg-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-secondary-transparent flex items-center justify-between">
            <p className="text-[13px] font-semibold text-fg inline-flex items-center gap-2">
              <TriangleAlertIcon className={cn("size-3.5", stats.lowStock.length ? "text-warning" : "text-muted")} />
              {p.stats.lowStock}
            </p>
            <Link href="/dashboard/catalogue" className="text-[12px] text-secondary hover:text-fg transition-colors">
              {p.recent.viewAll}
            </Link>
          </div>
          {!stats.lowStock.length ? (
            <p className="px-5 py-8 text-center text-[12px] text-muted">—</p>
          ) : (
            stats.lowStock.slice(0, 6).map((prod) => (
              <div key={prod.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-secondary-transparent2 last:border-b-0">
                <span className="text-[12px] text-fg truncate flex-1">{prod.name}</span>
                <span className={cn("text-[12px] font-mono tabular-nums", prod.stock === 0 ? "text-error" : "text-warning")}>
                  {prod.stock}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-3 border border-border rounded-module bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-secondary-transparent flex items-center justify-between">
          <p className="text-[13px] font-semibold text-fg">{p.recent.title}</p>
          <Link
            href="/dashboard/conversations"
            className="text-[12px] text-secondary hover:text-fg transition-colors"
          >
            {p.recent.viewAll}
          </Link>
        </div>

        {!stats.recent.length ? (
          <p className="px-5 py-10 text-center text-[12px] text-muted">{p.recent.empty}</p>
        ) : (
          stats.recent.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/conversations?c=${c.id}`}
              className="flex items-center gap-3 px-5 py-3 border-b border-secondary-transparent2 last:border-b-0 hover:bg-hover transition-colors"
            >
              <div className="size-7 rounded-full bg-secondary-transparent2 grid place-items-center text-[10px] font-semibold text-secondary shrink-0">
                {initialsFor(c, p.recent)}
              </div>
              <span className="text-[13px] text-fg truncate flex-1">
                {customerLabel(c, p.recent)}
              </span>
              {c.handoff && (
                <span className="text-[10px] text-warning shrink-0">{p.recent.needsYou}</span>
              )}
              <span className="text-[11px] text-muted shrink-0">
                {friendlyDate(c.last_message_at, language.lang === "en" ? "en-GB" : language.lang)}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
