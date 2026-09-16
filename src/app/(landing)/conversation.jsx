"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import Orb from "@/components/chat/orb";

/**
 * A conversation that types itself.
 *
 * Screenshots of a chat product are dead. Watching the assistant actually
 * check availability and book is the argument the page is making, so the hero
 * makes it in front of you rather than describing it.
 */
export default function Conversation({ turns, accent = "#c9ced6", label }) {
  const [shown, setShown] = useState(0);
  const [thinking, setThinking] = useState(false);
  const box = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    // Only run once it is actually on screen; an animation nobody watched has
    // already finished by the time they scroll to it.
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          setShown(1);
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!shown || shown >= turns.length) return;
    const next = turns[shown];
    // The assistant pauses to look things up; the customer does not.
    const isBot = next.from === "bot";
    if (isBot) setThinking(true);

    const wait = isBot ? 1100 : 700;
    const t = setTimeout(() => {
      setThinking(false);
      setShown((n) => n + 1);
    }, wait);
    return () => clearTimeout(t);
  }, [shown, turns]);

  return (
    <div
      ref={box}
      className="rounded-[22px] border border-border bg-card overflow-hidden shadow-[0_30px_90px_-40px_rgba(0,0,0,.9)]"
    >
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-secondary-transparent">
        <Orb accent={accent} size={28} live />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-fg leading-tight">{label}</p>
          <p className="text-[10px] text-muted leading-tight">online</p>
        </div>
      </div>

      <div className="p-4 space-y-2.5 min-h-[260px]">
        {turns.slice(0, shown).map((t, i) => (
          <div key={i} className={cn("flex animate-rise", t.from === "bot" ? "justify-start" : "justify-end")}>
            <p
              className={cn(
                "max-w-[86%] px-3.5 py-2.5 text-[12.5px] leading-relaxed rounded-[15px]",
                t.from === "bot"
                  ? "bg-secondary-transparent2 text-fg rounded-bl-[5px]"
                  : "text-primary rounded-br-[5px] font-medium",
              )}
              style={t.from === "you" ? { background: accent } : undefined}
            >
              {t.text}
            </p>
          </div>
        ))}

        {thinking && (
          <div className="flex justify-start animate-fade">
            <span className="bg-secondary-transparent2 rounded-[15px] rounded-bl-[5px] px-3.5 py-3 inline-flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 rounded-full bg-muted animate-bounce"
                  style={{ animationDelay: `${i * 140}ms` }}
                />
              ))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
