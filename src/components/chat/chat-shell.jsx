"use client";

import { useEffect, useState } from "react";
import Orb from "@/components/chat/orb";
import ChatPanel from "@/components/chat/chat-panel";
import { paletteVars, rgba } from "@/lib/widget-theme";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";

/**
 * The dialog's frame: header, backdrop, and the one control that closes it.
 *
 * It is deliberately the same material as the dashboard — a near-black card
 * with a hairline border, an accent wash bleeding out of the top corner, and
 * type at the same sizes — so the thing a customer talks to is recognisably
 * the same product the seller runs.
 *
 * Closing has to be handled here rather than by the launcher underneath,
 * because on a phone the panel fills the screen and there is no launcher left
 * to click. The parent page owns the iframe, so the request goes out over
 * postMessage; running standalone there is no parent and the button hides.
 */
export default function ChatShell({ theme, config, title, status: initialStatus = "assistant", panel, t }) {
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => {
    // window.parent === window when the page is opened directly.
    setEmbedded(window.parent && window.parent !== window);
  }, []);

  // Whether the assistant can actually answer. The server knows at load
  // whether the account has run out of credits; the panel finds out the rest
  // — a colleague taking over, or the assistant being paused mid-reply — and
  // reports it back.
  const [status, setStatus] = useState(initialStatus);

  const header = config.headerStyle || "full";
  const close = () => window.parent?.postMessage({ type: "signalo:close" }, "*");

  const label =
    status === "human" ? t?.statusHuman
    : status === "paused" ? t?.statusPaused
    : t?.statusAssistant;

  // A person answering is still someone answering, so only the paused state
  // loses the accent — it is the one where nothing is listening.
  const dot = status === "paused" ? theme.muted : theme.accentOnPanel;

  return (
    <main
      className="h-dvh flex flex-col overflow-hidden"
      style={{ ...paletteVars(theme), background: theme.bg, color: theme.fg }}
    >
      {header !== "hidden" && (
        <header className="relative shrink-0">
          {/* The wash is the app's own signature: light spilling from behind
              the header rather than a band of flat colour. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-28 h-44"
            style={{
              background: `radial-gradient(58% 72% at 16% 100%, ${rgba(theme.accentOnPanel, theme.isLight ? 0.18 : 0.22)} 0%, transparent 72%)`,
            }}
          />

          <div className="relative flex items-center gap-3 px-4 py-3.5">
            {header === "full" && (
              <Orb
                accent={theme.accent}
                accent2={config.accent2}
                motion={config.orbMotion}
                live={config.orbGlow !== false}
                size={36}
                className="relative"
              />
            )}

            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold truncate leading-tight" style={{ color: theme.fg }}>
                {title}
              </p>
              {header === "full" && (
                // The assistant's name was here, which on most accounts is
                // also the business name — so the header said it twice. What a
                // customer actually wants to know is who, if anyone, is going
                // to answer them.
                <p className="text-[11px] flex items-center gap-1.5 mt-0.5" style={{ color: theme.muted }}>
                  <span className="relative flex size-1.5 shrink-0">
                    {status !== "paused" && (
                      <span
                        className="absolute inset-0 rounded-full animate-ping opacity-60"
                        style={{ background: dot }}
                      />
                    )}
                    <span className="relative size-1.5 rounded-full" style={{ background: dot }} />
                  </span>
                  <span className="truncate">{label}</span>
                </p>
              )}
            </div>

            {embedded && (
              <button
                type="button"
                onClick={close}
                aria-label={t?.close || "Close chat"}
                className={cn(
                  "size-8 shrink-0 grid place-items-center rounded-full cursor-pointer",
                  "transition-[background-color,transform] duration-150 active:scale-95",
                  // A round control deserves a round ring; the default one is
                  // drawn on the element's square box.
                  "outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-0",
                )}
                style={{ color: theme.secondary, background: rgba(theme.fg, theme.isLight ? 0.06 : 0.09) }}
              >
                {/* A chevron, not a cross: the launcher underneath is the
                    cross, and two of them side by side asks the visitor to
                    work out which one they want. */}
                <ChevronDownIcon className="size-4" />
              </button>
            )}
          </div>

          <span
            aria-hidden
            className="block h-px"
            style={{
              background: `linear-gradient(to right, transparent, ${theme.border}, transparent)`,
            }}
          />
        </header>
      )}

      <ChatPanel {...panel} t={t} onStatus={setStatus} className="flex-1 min-h-0" />
    </main>
  );
}
