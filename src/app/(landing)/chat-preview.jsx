import { cn } from "@/lib/utils";

/**
 * A still of a real conversation.
 *
 * Deliberately not interactive: the working assistant is the launcher in the
 * corner, and two chat windows competing for attention reads as a bug.
 */
const TURNS = [
  { from: "them", text: "Hi! Table for 6 on Friday evening?" },
  { from: "us", text: "Of course. Friday 19 September I have 18:30, 19:00 and 21:15 free for six." },
  { from: "them", text: "19:00. One of us is vegetarian." },
  { from: "us", text: "Booked — Friday 19:00, table for 6, under your name. Four vegetarian mains on the menu, and the kitchen closes at 22:00." },
];

export default function ChatPreview({ label }) {
  return (
    <div className="rounded-module border border-border bg-card overflow-hidden shadow-[0_24px_80px_-32px_rgba(0,0,0,.9)]">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-secondary-transparent">
        <span className="size-7 rounded-full bg-[#c2410c] grid place-items-center text-[13px]">🍽️</span>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-fg leading-tight">Sandyq</p>
          <p className="text-[10px] text-muted leading-tight">{label}</p>
        </div>
        <span className="ml-auto size-1.5 rounded-full bg-success" />
      </div>

      <div className="p-4 space-y-2.5">
        {TURNS.map((t, i) => (
          <div key={i} className={cn("flex", t.from === "us" ? "justify-start" : "justify-end")}>
            <p
              className={cn(
                "max-w-[85%] px-3 py-2 text-[12.5px] leading-relaxed rounded-[14px]",
                t.from === "us"
                  ? "bg-secondary-transparent2 text-fg rounded-bl-[4px]"
                  : "bg-fg text-primary rounded-br-[4px]",
              )}
            >
              {t.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
