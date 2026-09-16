"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useMessages, useOrders, useSendAgentMessage, useUpdateConversation,
} from "@/hooks/use-conversations";
import { useAppointments } from "@/hooks/use-bookings";
import { cn } from "@/lib/utils";
import { DEFAULT_TZ } from "@/lib/timezone";
import { customerLabel, initialsFor, money, friendlyDate, personaIcon } from "@/lib/display";
import PersonaBadge from "@/components/ui/bot-icon";
import { showError, showSuccess } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { ChannelAvatar, ChannelTag } from "@/components/ui/channel-look";
import {
  BotIcon, CalendarCheckIcon, CalendarClockIcon, CalendarXIcon, CheckCircle2Icon,
  HandIcon, InfoIcon, LoaderIcon, PackageIcon, PhoneIcon, RotateCcwIcon, SendIcon,
  SparklesIcon, UserRoundIcon, XIcon,
} from "lucide-react";

/** Local midnight for `iso`, so messages group by the business's own day. */
function dayKey(iso, tz) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}

function clockOf(iso, tz) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * One conversation, read top to bottom.
 *
 * Two things were missing and both cost an operator a trip to another page:
 * who is answering right now, and whether the assistant's promises turned
 * into real bookings. Both are on this screen now.
 */
export default function Transcript({ conversation, language, timezone, p, res, onBack, backIcon: BackIcon }) {
  const tz = timezone || DEFAULT_TZ;
  const locale = language.lang === "en" ? "en-GB" : language.lang;

  const { data: messages, isLoading } = useMessages(conversation.id);
  const { data: orders } = useOrders({ conversationId: conversation.id });
  const { data: bookings } = useAppointments({ conversationId: conversation.id });
  const sendMessage = useSendAgentMessage();
  const updateConversation = useUpdateConversation();

  const [reply, setReply] = useState("");
  const [details, setDetails] = useState(false);
  const scroller = useRef(null);
  const box = useRef(null);

  const resolved = conversation.status === "resolved" || conversation.status === "closed";

  // A transcript that opens at the top makes you scroll to find the live end
  // of the conversation every single time.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length, conversation.id]);

  function handleSend(e) {
    e?.preventDefault();
    const text = reply.trim();
    if (!text || sendMessage.isPending) return;

    sendMessage.mutate(
      { conversationId: conversation.id, content: text },
      {
        onSuccess: (r) => {
          if (r?.success === false) return showError(r.message);
          setReply("");
          if (box.current) box.current.style.height = "auto";
        },
        onError: () => showError(res.messageSendError),
      },
    );
  }

  function patch(updates, message) {
    updateConversation.mutate(
      { id: conversation.id, updates },
      {
        onSuccess: (r) => (r?.success === false ? showError(r.message) : showSuccess(message)),
        onError: () => showError(res.conversationUpdateError),
      },
    );
  }

  // Consecutive messages from the same side become one block, and each day
  // gets a separator — otherwise a week-long chat reads as one wall.
  const blocks = useMemo(() => {
    const out = [];
    let lastDay = null;
    let current = null;

    for (const m of messages || []) {
      const day = dayKey(m.created_at, tz);
      if (day !== lastDay) {
        out.push({ type: "day", day, id: `day-${day}` });
        lastDay = day;
        current = null;
      }
      if (!current || current.role !== m.role) {
        current = { type: "block", role: m.role, items: [m], id: m.id };
        out.push(current);
      } else {
        current.items.push(m);
      }
    }
    return out;
  }, [messages, tz]);

  return (
    <>
      <header className="flex items-center gap-3 px-4 tablet:px-5 py-3 border-b border-secondary-transparent shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            aria-label={p.actions.back}
            className="tablet:hidden size-8 grid place-items-center rounded-button text-secondary hover:text-fg transition-colors cursor-pointer shrink-0"
          >
            <BackIcon className="size-4" />
          </button>
        )}

        <ChannelAvatar channel={conversation.channel} initials={initialsFor(conversation, p.labels)} size={34} />

        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-fg truncate leading-tight">
            {customerLabel(conversation, p.labels)}
          </p>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted">
            <ChannelTag
              channel={conversation.channel}
              label={p.channels[conversation.channel] || conversation.channel}
            />
            {conversation.phone && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{conversation.phone}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setDetails((v) => !v)}
            aria-label={p.actions.details}
            className={cn(
              "size-8 grid place-items-center rounded-button transition-colors cursor-pointer",
              details ? "bg-secondary-transparent2 text-fg" : "text-secondary hover:text-fg",
            )}
          >
            <InfoIcon className="size-4" />
          </button>
          {resolved ? (
            <Button variant="ghost" size="sm" onClick={() => patch({ status: "open", handoff: false, handoff_at: null }, res.conversationUpdated)}>
              <RotateCcwIcon className="size-3.5" />
              {p.actions.reopen}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => patch({ status: "resolved" }, res.conversationUpdated)}>
              <CheckCircle2Icon className="size-3.5" />
              {p.actions.resolve}
            </Button>
          )}
        </div>
      </header>

      {/* Who is answering, and the one button that changes it. */}
      <WhoIsAnswering
        conversation={conversation}
        p={p}
        busy={updateConversation.isPending}
        onTakeOver={() =>
          patch(
            { handoff: true, handoff_at: new Date().toISOString() },
            res.handoffTaken || res.conversationUpdated,
          )
        }
        onGiveBack={() =>
          patch({ handoff: false, handoff_at: null, status: "open" }, res.handoffReleased)
        }
      />

      <div className="flex-1 min-h-0 flex relative">
        <div ref={scroller} className="flex-1 min-w-0 overflow-y-auto px-4 tablet:px-5 py-5 scrollbar-none">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <LoaderIcon className="animate-spin text-muted size-5" />
            </div>
          ) : !blocks.length ? (
            <p className="text-center text-[12px] text-muted py-10">{p.transcript.empty}</p>
          ) : (
            <div className="space-y-4 max-w-[760px] mx-auto">
              {blocks.map((b) =>
                b.type === "day" ? (
                  <DaySeparator key={b.id} day={b.day} locale={locale} tz={tz} p={p} />
                ) : (
                  <MessageBlock key={b.id} block={b} tz={tz} locale={locale} p={p} />
                ),
              )}
            </div>
          )}
        </div>

        {details && (
          <DetailsRail
            conversation={conversation}
            orders={orders}
            bookings={bookings}
            locale={locale}
            tz={tz}
            p={p}
            onClose={() => setDetails(false)}
          />
        )}
      </div>

      <form
        onSubmit={handleSend}
        className="border-t border-secondary-transparent px-4 tablet:px-5 py-3 shrink-0"
      >
        <div className="max-w-[760px] mx-auto flex items-end gap-2">
          <textarea
            ref={box}
            rows={1}
            value={reply}
            onChange={(e) => {
              setReply(e.target.value);
              // Grow with the text instead of hiding it behind a scrollbar.
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) handleSend(e);
            }}
            placeholder={p.reply.placeholder}
            className="flex-1 resize-none bg-secondary-transparent2 border border-secondary-transparent rounded-button px-3.5 py-2.5 text-[13px] text-fg placeholder:text-muted outline-none focus:border-secondary/50 transition-colors leading-relaxed"
          />
          <button
            type="submit"
            disabled={sendMessage.isPending || !reply.trim()}
            aria-label={p.reply.send}
            className="size-9 shrink-0 rounded-button bg-fg text-primary grid place-items-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity"
          >
            {sendMessage.isPending ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <SendIcon className="size-4" />
            )}
          </button>
        </div>
        <p className="max-w-[760px] mx-auto text-[10px] text-muted mt-1.5">{p.reply.hint}</p>
      </form>
    </>
  );
}

/**
 * The state that matters most, stated plainly.
 *
 * Whether a customer is talking to the assistant or waiting on a person was
 * previously encoded in a small orange chip, and the only way back was a
 * button that appeared somewhere else.
 */
function WhoIsAnswering({ conversation, p, onTakeOver, onGiveBack, busy }) {
  const human = conversation.handoff;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-4 tablet:px-5 py-2 border-b shrink-0 text-[12px] animate-fade",
        human
          ? "bg-warning/[0.07] border-warning/20 text-warning"
          : "bg-secondary-transparent2 border-secondary-transparent text-secondary",
      )}
    >
      {human ? <UserRoundIcon className="size-3.5 shrink-0" /> : <SparklesIcon className="size-3.5 shrink-0 text-accent" />}
      <span className="min-w-0 truncate">
        {human ? p.answering.you : p.answering.assistant}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={human ? onGiveBack : onTakeOver}
        className={cn(
          "ml-auto shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-button font-medium transition-colors cursor-pointer disabled:opacity-50",
          human
            ? "bg-warning/15 hover:bg-warning/25"
            : "bg-secondary-transparent2 text-secondary hover:text-fg",
        )}
      >
        {human ? <BotIcon className="size-3" /> : <HandIcon className="size-3" />}
        {human ? p.actions.backToAssistant : p.actions.takeOver}
      </button>
    </div>
  );
}

function DaySeparator({ day, locale, tz, p }) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  const label =
    day === today
      ? p.transcript.today
      : new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "short", day: "numeric", month: "short" })
          .format(new Date(`${day}T12:00:00Z`));

  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-secondary-transparent" />
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className="h-px flex-1 bg-secondary-transparent" />
    </div>
  );
}

/** One side's run of messages, with its label said once. */
function MessageBlock({ block, tz, locale, p }) {
  const fromCustomer = block.role === "customer";
  const fromAgent = block.role === "agent";

  return (
    <div className={cn("flex flex-col gap-1", fromCustomer ? "items-start" : "items-end")}>
      <span className="text-[10px] text-muted px-1">
        {fromCustomer ? p.labels.customer : fromAgent ? p.labels.you : p.labels.ai}
      </span>

      {block.items.map((m) => (
        <div key={m.id} className={cn("flex flex-col gap-1 max-w-[80%] tablet:max-w-[68%]", fromCustomer ? "items-start" : "items-end")}>
          <div
            className={cn(
              "rounded-[14px] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words animate-rise",
              fromCustomer
                ? "bg-secondary-transparent2 border border-secondary-transparent text-fg rounded-tl-[5px]"
                : fromAgent
                  ? "bg-info/15 border border-info/30 text-fg rounded-tr-[5px]"
                  : "bg-card border border-border text-fg rounded-tr-[5px]",
            )}
          >
            {m.content}
          </div>

          {/* What the assistant actually did, not just what it said. */}
          {m.metadata?.actions?.map((a, i) => (
            <ActionChip key={i} action={a} tz={tz} locale={locale} p={p} />
          ))}

          <span className="text-[10px] text-muted px-1 tabular-nums">{clockOf(m.created_at, tz)}</span>
        </div>
      ))}
    </div>
  );
}

const ACTION_LOOK = {
  booked:    { Icon: CalendarCheckIcon, tone: "text-success border-success/30 bg-success/10" },
  moved:     { Icon: CalendarClockIcon, tone: "text-info border-info/30 bg-info/10" },
  cancelled: { Icon: CalendarXIcon,     tone: "text-error border-error/30 bg-error/10" },
  order:     { Icon: PackageIcon,       tone: "text-success border-success/30 bg-success/10" },
  handoff:   { Icon: UserRoundIcon,     tone: "text-warning border-warning/30 bg-warning/10" },
};

function ActionChip({ action, tz, locale, p }) {
  const look = ACTION_LOOK[action.kind];
  if (!look) return null;

  const when = action.at ? friendlyDate(action.at, locale, tz) : "";
  const text =
    action.kind === "order"
      ? p.actionChips.order.replace("{value}", money(action.total, action.currency))
      : (p.actionChips[action.kind] || "").replace("{when}", when);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-button border text-[11px] font-medium animate-pop",
        look.tone,
      )}
    >
      <look.Icon className="size-3" />
      {text}
    </span>
  );
}

/**
 * Everything about this customer that is not a message.
 *
 * Opened on demand, because most of the time the conversation is the point.
 */
function DetailsRail({ conversation, orders, bookings, locale, tz, p, onClose }) {
  const live = (bookings || []).filter((b) => b.status !== "cancelled");

  return (
    // Wide enough and it sits beside the transcript; narrower and it slides
    // over it, because 260px of rail would leave nothing to read.
    <aside className="absolute inset-y-0 right-0 z-10 w-[272px] bg-card laptop-2:static laptop-2:bg-transparent laptop-2:w-[260px] shrink-0 border-l border-secondary-transparent overflow-y-auto scrollbar-none animate-fade">
      <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-transparent">
        <span className="text-[12px] font-semibold text-fg">{p.details.title}</span>
        <button
          onClick={onClose}
          aria-label={p.details.close}
          className="size-6 grid place-items-center rounded-button text-muted hover:text-fg transition-colors cursor-pointer"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      <div className="px-4 py-4 space-y-4 text-[12px]">
        <Detail label={p.details.channel}>
          <ChannelTag channel={conversation.channel} label={p.channels[conversation.channel] || conversation.channel} />
        </Detail>
        {conversation.phone && (
          <Detail label={p.details.contact}>
            <span className="inline-flex items-center gap-1.5">
              <PhoneIcon className="size-3 text-muted" />
              {conversation.phone}
            </span>
          </Detail>
        )}
        {conversation.personas?.name && (
          <Detail label={p.details.persona}>
            <span className="inline-flex items-center gap-1.5">
              <PersonaGlyph icon={conversation.personas.icon} />
              {conversation.personas.name}
            </span>
          </Detail>
        )}
        <Detail label={p.details.firstSeen}>{friendlyDate(conversation.created_at, locale, tz)}</Detail>

        {live.length > 0 && (
          <div>
            <p className="text-[11px] text-muted mb-1.5">{p.details.bookings}</p>
            <div className="space-y-1.5">
              {live.map((b) => (
                <div key={b.id} className="rounded-button border border-secondary-transparent px-2.5 py-2">
                  <p className="text-fg truncate">{b.services?.name || p.details.deletedService}</p>
                  <p className="text-[11px] text-muted tabular-nums">{friendlyDate(b.starts_at, locale, tz)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {orders?.length > 0 && (
          <div>
            <p className="text-[11px] text-muted mb-1.5">{p.details.orders}</p>
            <div className="space-y-1.5">
              {orders.map((o) => (
                <div key={o.id} className="rounded-button border border-secondary-transparent px-2.5 py-2">
                  <p className="text-fg leading-snug">
                    {(o.items || []).map((i) => `${i.quantity}× ${i.title}`).join(", ")}
                  </p>
                  <p className="text-[11px] text-success tabular-nums mt-0.5">{money(o.total, o.currency)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

/** An emoji as text, an icon token as the icon it names. */
function PersonaGlyph({ icon }) {
  const { emoji, shape } = personaIcon(icon);
  if (emoji) return <span>{emoji}</span>;
  return <PersonaBadge shape={shape} size={16} bare className="text-secondary" />;
}

function Detail({ label, children }) {
  return (
    <div>
      <p className="text-[11px] text-muted mb-1">{label}</p>
      <div className="text-fg">{children}</div>
    </div>
  );
}
