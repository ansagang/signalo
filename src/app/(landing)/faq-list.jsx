"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PlusIcon } from "lucide-react";

export default function FaqList({ items }) {
  const [open, setOpen] = useState(0);

  return (
    <div className="divide-y divide-[var(--color-secondary-transparent)] border-y border-secondary-transparent">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
              className="w-full flex items-start gap-4 py-5 text-left cursor-pointer group"
            >
              <span className="flex-1 text-[15px] font-medium text-fg group-hover:text-fg">{item.q}</span>
              <PlusIcon
                className={cn(
                  "size-4 shrink-0 mt-0.5 text-muted transition-transform duration-200",
                  isOpen && "rotate-45",
                )}
              />
            </button>
            {/* Grid-rows animation keeps the height honest without measuring. */}
            <div
              className={cn(
                "grid transition-all duration-200 ease-out",
                isOpen ? "grid-rows-[1fr] opacity-100 pb-5" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <p className="text-[14px] text-secondary leading-relaxed max-w-[62ch]">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
