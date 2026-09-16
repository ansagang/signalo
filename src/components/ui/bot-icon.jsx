"use client";

import { cn } from "@/lib/utils";
import {
  BotIcon as BotGlyph, SparklesIcon, MessageCircleIcon, HeadsetIcon, ShoppingBagIcon,
  ScissorsIcon, HeartIcon, StarIcon, ZapIcon, CoffeeIcon, GemIcon, FlowerIcon,
  WrenchIcon, PackageIcon, SmileIcon, CrownIcon, LeafIcon, RocketIcon,
} from "lucide-react";

/**
 * The assistant's icon, as customers see it.
 *
 * It belongs to the channel, not the persona: the same persona can answer on
 * a website widget and in Telegram, and each surface is branded separately.
 * Only the shape is chosen — the background is the widget's accent colour, so
 * the icon can never drift out of step with the rest of the widget.
 */

/** Readable ink for a given background — accents range from near-white to near-black. */
export function inkOn(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#000";
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? "#0a0a0c" : "#ffffff";
}
export const ICON_SHAPES = {
  bot: BotGlyph,
  sparkles: SparklesIcon,
  message: MessageCircleIcon,
  headset: HeadsetIcon,
  bag: ShoppingBagIcon,
  scissors: ScissorsIcon,
  heart: HeartIcon,
  star: StarIcon,
  zap: ZapIcon,
  coffee: CoffeeIcon,
  gem: GemIcon,
  flower: FlowerIcon,
  wrench: WrenchIcon,
  package: PackageIcon,
  smile: SmileIcon,
  crown: CrownIcon,
  leaf: LeafIcon,
  rocket: RocketIcon,
};

export const SHAPE_KEYS = Object.keys(ICON_SHAPES);

export default function BotIcon({ shape, accent = "#c9ced6", size = 36, className, rounded = "rounded-button", bare }) {
  const Shape = ICON_SHAPES[shape] || ICON_SHAPES.bot;

  return (
    <span
      className={cn("grid place-items-center shrink-0", rounded, className)}
      style={
        bare
          ? { width: size, height: size, color: inkOn(accent) }
          : { width: size, height: size, background: accent, color: inkOn(accent) }
      }
    >
      <Shape style={{ width: size * 0.52, height: size * 0.52 }} strokeWidth={2.2} />
    </span>
  );
}

/** Shape grid. The background is the widget accent, so there is nothing else to pick. */
export function BotIconPicker({ shape = "bot", accent = "#c9ced6", onChange, className }) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {SHAPE_KEYS.map((s) => {
        const Shape = ICON_SHAPES[s];
        const active = s === shape;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            aria-label={s}
            className={cn(
              "size-9 grid place-items-center rounded-button transition-colors cursor-pointer border",
              active ? "border-transparent" : "border-transparent text-muted hover:text-fg hover:bg-hover",
            )}
            style={active ? { background: accent, color: inkOn(accent) } : undefined}
          >
            <Shape className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
