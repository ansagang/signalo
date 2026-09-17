"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import BotIcon from "@/components/ui/bot-icon";
import Orb from "@/components/chat/orb";
import { fill } from "@/lib/widget-language";
import { SendIcon, LoaderIcon, CheckCircle2Icon, UserRoundIcon } from "lucide-react";

/**
 * English is the floor, not the source of truth.
 *
 * The seller's own language pack supplies these; this object only covers the
 * playground, which has no visitor whose language to follow.
 */
const TOOL_LABELS = {
  create_order: "Recording the order",
  capture_contact: "Saving contact details",
  request_human: "Bringing in a colleague",
  check_availability: "Checking free times",
  book_appointment: "Making the booking",
  reschedule_appointment: "Moving the booking",
  cancel_appointment: "Cancelling the booking",
  show_items: "Finding what we have",
};

const FALLBACK = {
  placeholder: "Type a message…",
  send: "Send",
  emptyPrompt: "Ask {name} anything a customer might ask.",
  orderRecorded: "Order recorded — {total} {currency}",
  handedOver: "Handed to a colleague",
  handedOverWhy: "Handed to a colleague — {reason}",
  poweredBy: "Powered by Signalo",
  working: "Working",
  tools: TOOL_LABELS,
  unreachable: "Could not reach the assistant.",
};

/**
 * Streaming chat surface. Shared by the public widget page and the dashboard
 * playground — the only difference is which credential it sends.
 *
 * `publicKey` → public channel. `personaId` → authenticated playground.
 */
export default function ChatPanel({
  publicKey,
  personaId,
  greeting,
  personaName = "Assistant",
  botShape = "",
  botAccent = "#c9ced6",
  placeholder,
  density = "cosy",
  starters = [],
  t,
  locale = "en",
  branded = false,
  origin = "",
  onStatus,
  className,
  onEvent,
}) {
  // The widget's own words, in the visitor's language. Every string below
  // reads from here, so a missing translation degrades to English rather
  // than to a blank label.
  const w = { ...FALLBACK, ...(t || {}), tools: { ...TOOL_LABELS, ...(t?.tools || {}) } };
  // Two packings, not a slider. A seller asked for "more compact" means the
  // whole panel tightens together — padding, gaps and bubble size at once —
  // not one number they have to tune against the others.
  const d = density === "compact"
    ? { pad: "px-3 py-3.5", gap: "space-y-2", bubble: "px-3 py-2 text-[12.5px]", form: "p-2.5" }
    : { pad: "px-4 py-5", gap: "space-y-3", bubble: "px-3.5 py-2.5 text-[13px]", form: "p-3" };
  const [messages, setMessages] = useState(() =>
    greeting ? [{ role: "assistant", content: greeting }] : [],
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTool, setActiveTool] = useState(null);
  const [error, setError] = useState(null);
  const sessionRef = useRef(null);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  const lastSeenRef = useRef(null);
  const busyRef = useRef(false);

  // Reset when the playground switches persona.
  useEffect(() => {
    sessionRef.current = null;
    setMessages(greeting ? [{ role: "assistant", content: greeting }] : []);
    setError(null);
  }, [personaId, publicKey, greeting]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activeTool]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep a ref in step with state so the poller can read it without
  // re-subscribing on every keystroke.
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // A human can take the conversation over from the dashboard. Their replies
  // land in the database, not in our SSE stream, so watch for them.
  useEffect(() => {
    if (!publicKey) return undefined;

    const tick = async () => {
      if (!sessionRef.current || busyRef.current || document.hidden) return;
      try {
        const params = new URLSearchParams({
          public_key: publicKey,
          session_id: sessionRef.current,
        });
        if (lastSeenRef.current) params.set("after", lastSeenRef.current);

        const res = await fetch(`/api/chat/messages?${params}`);
        if (!res.ok) return;
        const body = await res.json();
        if (!body.messages?.length) return;

        lastSeenRef.current = body.messages[body.messages.length - 1].created_at;
        setMessages((m) => {
          const seen = new Set(m.map((x) => x.id).filter(Boolean));
          const fresh = body.messages
            .filter((x) => !seen.has(x.id))
            .map((x) => ({ id: x.id, role: "assistant", content: x.content, agent: x.role === "agent" }));
          return fresh.length ? [...m, ...fresh] : m;
        });
      } catch {
        // A failed poll is not worth surfacing; the next one will retry.
      }
    };

    const id = setInterval(tick, 6000);
    return () => clearInterval(id);
  }, [publicKey]);

  const send = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      setError(null);
      setBusy(true);
      setInput("");
      // Address the streaming bubble by id: system notices (orders, handoffs)
      // get appended while it is still filling, so "the last message" is not
      // a safe handle for it.
      const streamId = `a${Date.now()}`;
      setMessages((m) => [
        ...m,
        { id: `c${Date.now()}`, role: "customer", content: trimmed },
        { id: streamId, role: "assistant", content: "" },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            // The language the visitor's own browser asked for, resolved
            // server-side. The assistant's "match the customer" rule then has
            // something to go on from the very first message, before anyone
            // has written enough words to tell.
            locale,
            message: trimmed,
            ...(publicKey ? { public_key: publicKey } : { persona_id: personaId }),
            ...(sessionRef.current ? { session_id: sessionRef.current } : {}),
          }),
        });

        if (!res.ok || !res.body) {
          const detail = await res.json().catch(() => ({}));
          throw new Error(detail.message || `Request failed (${res.status})`);
        }

        // A conversation a colleague has taken over answers with plain JSON,
        // not a stream. Reading it as one found no events, so the visitor's
        // message vanished into an empty bubble and nothing said why.
        if ((res.headers.get("content-type") || "").includes("application/json")) {
          const body = await res.json().catch(() => ({}));
          if (body.session_id) sessionRef.current = body.session_id;
          if (body.handoff) onStatus?.("human");
          setMessages((m) => m.filter((msg) => msg.id !== streamId));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // SSE frames are separated by a blank line; keep the trailing
          // partial frame in the buffer until its terminator arrives.
          const frames = buffer.split("\n\n");
          buffer = frames.pop() || "";

          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;

            let event;
            try {
              event = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            onEvent?.(event);

            switch (event.type) {
              case "session":
                sessionRef.current = event.session_id;
                break;
              case "done":
                // Everything up to now is rendered; poll only for what follows.
                lastSeenRef.current = new Date().toISOString();
                break;
              case "delta":
                setMessages((m) =>
                  m.map((msg) =>
                    msg.id === streamId
                      ? { ...msg, content: msg.content + event.text }
                      : msg,
                  ),
                );
                break;
              case "tool":
                setActiveTool(w.tools[event.name] || w.working);
                break;
              case "cards":
                setMessages((m) => [
                  ...m,
                  { id: `k${Date.now()}`, role: "cards", cards: event.cards },
                ]);
                break;
              case "order":
                setMessages((m) => [
                  ...m,
                  { id: `o${event.order?.id || Date.now()}`, role: "system", kind: "order", order: event.order },
                ]);
                break;
              case "paused":
                onStatus?.("paused");
                break;
              case "handoff":
                onStatus?.("human");
                setMessages((m) => [
                  ...m,
                  { id: `h${Date.now()}`, role: "system", kind: "handoff", reason: event.reason },
                ]);
                break;
              case "error":
                setError(event.message);
                break;
              default:
                break;
            }
          }
        }
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message || w.unreachable);
      } finally {
        setActiveTool(null);
        setBusy(false);
        // Drop the placeholder if nothing ever streamed into it.
        setMessages((m) => m.filter((msg) => msg.id !== streamId || msg.content));
      }
    },
    [busy, personaId, publicKey, onEvent],
  );

  return (
    <div className={cn("flex flex-col h-full min-h-0 bg-bg", className)}>
      {/* The inner wrapper carries the spacing and `mt-auto`, so a two-message
          conversation sits on the composer the way every chat does, while a
          long one still scrolls from the top. */}
      <div ref={scrollRef} className={cn("flex-1 min-h-0 overflow-y-auto scrollbar-none flex flex-col", d.pad)}>
        <div className={cn("mt-auto w-full", d.gap)}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center gap-3 py-12 animate-fade">
            {/* The orb, not the icon plate: the icon is optional and the orb
                is what the visitor just clicked. */}
            <Orb accent={botAccent} size={46} live />
            <p className="text-[13px] text-muted max-w-[240px] leading-relaxed">
              {fill(w.emptyPrompt, { name: personaName })}
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "cards") {
            return (
              <div key={msg.id || i} className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1 animate-rise">
                {msg.cards.map((card) => (
                  <ItemCard key={`${card.kind}-${card.id}`} card={card} />
                ))}
              </div>
            );
          }

          if (msg.role === "system") {
            const order = msg.kind === "order";
            return (
              <div
                key={msg.id || i}
                className="mx-auto w-fit max-w-[90%] rounded-full border border-secondary-transparent bg-secondary-transparent2 px-3 py-1.5 text-[11.5px] flex items-center gap-2 text-secondary animate-pop"
              >
                {order ? (
                  <>
                    <CheckCircle2Icon className="size-3.5 shrink-0 text-success" />
                    {fill(w.orderRecorded, {
                      total: Number(msg.order?.total || 0).toLocaleString(locale),
                      currency: String(msg.order?.currency || "").toUpperCase(),
                    })}
                  </>
                ) : (
                  <>
                    <UserRoundIcon className="size-3.5 shrink-0 text-warning" />
                    {msg.reason
                      ? fill(w.handedOverWhy, { reason: msg.reason })
                      : w.handedOver}
                  </>
                )}
              </div>
            );
          }

          const mine = msg.role === "customer";
          // Consecutive messages from one side lose their tail, so a run reads
          // as one person still talking rather than as separate remarks.
          const runs = messages[i - 1]?.role === msg.role;

          return (
            <div key={msg.id || i} className={cn("flex animate-rise", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] leading-relaxed whitespace-pre-wrap break-words rounded-[18px]",
                  d.bubble,
                  mine
                    ? "font-medium"
                    : msg.agent
                      ? "border border-info/35 bg-info/15 text-fg"
                      : "border border-secondary-transparent bg-secondary-transparent2 text-fg",
                  mine && !runs && "rounded-br-[6px]",
                  !mine && !runs && "rounded-bl-[6px]",
                )}
                // The customer's own bubble is the one place the seller's
                // colour fills a shape, so its ink is the tested pairing
                // rather than whichever of black or white looked right once.
                style={mine ? { background: "var(--color-accent)", color: "var(--color-accent-ink)" } : undefined}
              >
                {msg.content || (
                  <span className="inline-flex gap-1 py-1">
                    <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Openers the seller wrote. A blank panel asks the visitor to invent
            a question; three real ones tell them what this assistant is for,
            and they disappear the moment anybody types. */}
        {starters.length > 0 && messages.length <= 1 && !busy && (
          <div className="flex flex-wrap gap-1.5 pt-1 animate-fade">
            {starters.slice(0, 4).map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => send(text)}
                className="px-3 py-1.5 rounded-full border border-secondary-transparent bg-secondary-transparent2 text-[12px] text-secondary hover:text-fg hover:border-accent/40 transition-colors cursor-pointer text-left"
              >
                {text}
              </button>
            ))}
          </div>
        )}

        {activeTool && (
          <div className="flex items-center gap-2 text-[11px] text-muted px-1 animate-fade">
            <LoaderIcon className="size-3 animate-spin" />
            {activeTool}…
          </div>
        )}

        {error && (
          <div className="rounded-button border border-error/40 bg-error/10 px-3 py-2 text-[12px] text-error animate-pop">
            {error}
          </div>
        )}
        </div>
      </div>

      {/* One field, not an input sitting next to a button. The send control
          lives inside the same surface, which is what every chat a visitor
          already uses looks like. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className={cn("shrink-0 bg-bg", d.form)}
      >
        <div
          className={cn(
            "flex items-end gap-1.5 rounded-[20px] border border-secondary-transparent bg-secondary-transparent2",
            "pl-3.5 pr-1.5 py-1.5 transition-colors focus-within:border-accent/45",
          )}
        >
          <textarea
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Grow with the text rather than hiding it behind a scrollbar.
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 112)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={placeholder || w.placeholder}
            disabled={busy}
            className="flex-1 min-w-0 resize-none bg-transparent border-none py-1.5 text-[13px] text-fg placeholder:text-muted outline-none leading-relaxed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label={w.send}
            className="size-8 shrink-0 rounded-full grid place-items-center disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition-transform duration-150 hover:scale-105 active:scale-95"
            style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)" }}
          >
            {busy ? <LoaderIcon className="size-3.5 animate-spin" /> : <SendIcon className="size-3.5" />}
          </button>
        </div>

        {/* A line, not a badge. It has to be findable by anyone wondering what
            this thing is, and invisible to everyone else — which rules out
            putting it anywhere above the composer. */}
        {branded && (
          <a
            href={`${origin}/?utm_source=widget`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-[10px] text-muted/70 hover:text-muted transition-colors mt-1.5"
          >
            {w.poweredBy}
          </a>
        )}
      </form>
    </div>
  );
}

/** A product or service the assistant chose to show, with its photo. */
function ItemCard({ card }) {
  const price = Number(card.price || 0);
  return (
    <div className="w-[150px] shrink-0 rounded-[14px] border border-secondary-transparent bg-secondary-transparent2 overflow-hidden transition-colors hover:border-accent/40">
      {card.image_url ? (
        <img src={card.image_url} alt="" className="w-full h-[96px] object-cover" />
      ) : (
        <div className="w-full h-[96px] grid place-items-center bg-secondary-transparent2 text-muted text-[20px]">
          {card.kind === "service" ? "\u2726" : "\u25a3"}
        </div>
      )}
      <div className="p-2.5">
        <p className="text-[12px] font-medium text-fg leading-snug line-clamp-2">{card.name}</p>
        <p className="text-[11px] text-secondary mt-1">
          {price > 0 ? `${price.toLocaleString("en-US")} ${String(card.currency || "").toUpperCase()}` : ""}
          {card.kind === "service" && card.duration_min ? ` · ${card.duration_min}m` : ""}
        </p>
      </div>
    </div>
  );
}

function Dot({ delay = "0ms" }) {
  return (
    <span
      className="size-1.5 rounded-full bg-muted animate-bounce inline-block"
      style={{ animationDelay: delay }}
    />
  );
}
