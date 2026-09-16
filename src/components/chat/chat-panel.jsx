"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import BotIcon from "@/components/ui/bot-icon";
import { SendIcon, LoaderIcon, CheckCircle2Icon, UserRoundIcon } from "lucide-react";

const TOOL_LABELS = {
  create_order: "Recording the order",
  capture_contact: "Saving contact details",
  request_human: "Bringing in a colleague",
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
  botShape = "bot",
  botAccent = "#c9ced6",
  placeholder = "Type a message…",
  className,
  onEvent,
}) {
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
            message: trimmed,
            ...(publicKey ? { public_key: publicKey } : { persona_id: personaId }),
            ...(sessionRef.current ? { session_id: sessionRef.current } : {}),
          }),
        });

        if (!res.ok || !res.body) {
          const detail = await res.json().catch(() => ({}));
          throw new Error(detail.message || `Request failed (${res.status})`);
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
                setActiveTool(TOOL_LABELS[event.name] || "Working");
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
              case "handoff":
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
        if (err.name !== "AbortError") setError(err.message || "Could not reach the assistant.");
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
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-3 scrollbar-none">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-10">
            <BotIcon shape={botShape} accent={botAccent} size={44} />
            <p className="text-sm text-muted max-w-[240px]">
              Ask {personaName} anything a customer might ask.
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
            return (
              <div
                key={msg.id || i}
                className={cn(
                  "mx-auto max-w-[85%] rounded-button border px-3 py-2 text-[12px] flex items-center gap-2",
                  msg.kind === "order"
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-warning/40 bg-warning/10 text-warning",
                )}
              >
                {msg.kind === "order" ? (
                  <>
                    <CheckCircle2Icon className="size-3.5 shrink-0" />
                    Order recorded — {Number(msg.order?.total || 0).toLocaleString()}{" "}
                    {String(msg.order?.currency || "").toUpperCase()}
                  </>
                ) : (
                  <>
                    <UserRoundIcon className="size-3.5 shrink-0" />
                    Handed to a colleague{msg.reason ? ` — ${msg.reason}` : ""}
                  </>
                )}
              </div>
            );
          }

          const mine = msg.role === "customer";
          return (
            <div key={msg.id || i} className={cn("flex animate-rise", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  // A tail on the corner nearest its author reads as speech
                  // rather than as a list of boxes.
                  "max-w-[85%] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words rounded-[16px] shadow-sm",
                  mine
                    ? "bg-accent text-primary font-medium rounded-br-[5px]"
                    : msg.agent
                      ? "bg-info/15 border border-info/35 text-fg rounded-bl-[5px]"
                      : "bg-secondary-transparent2 border border-secondary-transparent text-fg rounded-bl-[5px]",
                )}
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

        {activeTool && (
          <div className="flex items-center gap-2 text-[11px] text-muted px-1 animate-fade">
            <LoaderIcon className="size-3 animate-spin" />
            <span className="relative overflow-hidden">
              {activeTool}…
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-button border border-error/40 bg-error/10 px-3 py-2 text-[12px] text-error">
            {error}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-secondary-transparent p-3 flex items-end gap-2 shrink-0 bg-bg"
      >
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={placeholder}
          disabled={busy}
          className="flex-1 resize-none bg-secondary-transparent2 border border-secondary-transparent rounded-[14px] px-3.5 py-2.5 text-[13px] text-fg placeholder:text-muted outline-none transition-colors focus:border-accent/45 max-h-28 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="size-9 shrink-0 rounded-full bg-accent text-primary grid place-items-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-transform duration-150 hover:scale-105 active:scale-95"
        >
          {busy ? <LoaderIcon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
        </button>
      </form>
    </div>
  );
}

/** A product or service the assistant chose to show, with its photo. */
function ItemCard({ card }) {
  const price = Number(card.price || 0);
  return (
    <div className="w-[150px] shrink-0 rounded-button border border-secondary-transparent bg-secondary-transparent2 overflow-hidden">
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
