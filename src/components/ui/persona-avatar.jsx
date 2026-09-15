"use client";

import { cn } from "@/lib/utils";
import {
  BotIcon, SparklesIcon, MessageCircleIcon, HeadsetIcon, ShoppingBagIcon,
  ScissorsIcon, HeartIcon, StarIcon, ZapIcon, CoffeeIcon, GemIcon, FlowerIcon,
  WrenchIcon, PackageIcon, SmileIcon, CrownIcon, LeafIcon, RocketIcon,
} from "lucide-react";

/**
 * Persona avatar.
 *
 * `personas.icon` holds `icon:<shape>:<colour>`. Emoji were clip-art next to
 * the rest of the interface and a monogram said nothing about the assistant,
 * so this is a curated set of shapes in a fixed palette. Anything that does
 * not match the format is rendered verbatim, so old emoji keep working.
 */
export const ICON_SHAPES = {
  bot: BotIcon,
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

export const ICON_COLORS = {
  mint:    { bg: "#00d26a", ink: "#04140c" },
  ocean:   { bg: "#0090ff", ink: "#04101d" },
  violet:  { bg: "#a855f7", ink: "#140520" },
  rose:    { bg: "#ff5fa2", ink: "#210510" },
  amber:   { bg: "#ffb200", ink: "#1d1100" },
  crimson: { bg: "#f43f5e", ink: "#1d0407" },
  teal:    { bg: "#22d3ee", ink: "#04171b" },
  slate:   { bg: "#94a3b8", ink: "#0b1120" },
};

export const SHAPE_KEYS = Object.keys(ICON_SHAPES);
export const COLOR_KEYS = Object.keys(ICON_COLORS);

export const DEFAULT_ICON = "icon:bot:mint";

/** `icon:sparkles:rose` → { Shape, colour } */
export function parseIcon(icon) {
  if (typeof icon !== "string" || !icon.startsWith("icon:")) return null;
  const [, shape, color] = icon.split(":");
  const Shape = ICON_SHAPES[shape];
  const colour = ICON_COLORS[color];
  return Shape && colour ? { Shape, colour, shape, color } : null;
}

export function buildIcon(shape, color) {
  return `icon:${shape}:${color}`;
}

export default function PersonaAvatar({ icon, name, size = 36, className, rounded = "rounded-button" }) {
  const parsed = parseIcon(icon);

  if (!parsed) {
    // Emoji pass through. Anything token-shaped (`preset:…`, a malformed
    // `icon:…`) must never be printed verbatim, so fall back to the default.
    const tokenish = typeof icon === "string" && icon.includes(":");
    const glyph = !icon || tokenish ? null : icon;

    if (!glyph) {
      const { Shape, colour } = parseIcon(DEFAULT_ICON);
      return (
        <span
          className={cn("grid place-items-center shrink-0", rounded, className)}
          style={{ width: size, height: size, background: colour.bg, color: colour.ink }}
        >
          <Shape style={{ width: size * 0.52, height: size * 0.52 }} strokeWidth={2.2} />
        </span>
      );
    }

    return (
      <span
        className={cn("grid place-items-center bg-secondary-transparent2 shrink-0", rounded, className)}
        style={{ width: size, height: size, fontSize: size * 0.5 }}
      >
        {glyph}
      </span>
    );
  }

  const { Shape, colour } = parsed;
  return (
    <span
      className={cn("grid place-items-center shrink-0", rounded, className)}
      style={{ width: size, height: size, background: colour.bg, color: colour.ink }}
    >
      <Shape style={{ width: size * 0.52, height: size * 0.52 }} strokeWidth={2.2} />
    </span>
  );
}

/** Shape grid plus a colour row — the picker used in the persona editor. */
export function AvatarPicker({ value, onChange, className }) {
  const parsed = parseIcon(value);
  const shape = parsed?.shape || "bot";
  const color = parsed?.color || "mint";

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap gap-1.5">
        {SHAPE_KEYS.map((s) => {
          const Shape = ICON_SHAPES[s];
          const active = s === shape;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(buildIcon(s, color))}
              aria-label={s}
              className={cn(
                "size-9 grid place-items-center rounded-button transition-colors cursor-pointer border",
                active
                  ? "border-fg text-fg bg-secondary-transparent2"
                  : "border-transparent text-muted hover:text-fg hover:bg-hover",
              )}
            >
              <Shape className="size-4" />
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {COLOR_KEYS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(buildIcon(shape, c))}
            aria-label={c}
            style={{ background: ICON_COLORS[c].bg }}
            className={cn(
              "size-7 rounded-full cursor-pointer transition-transform",
              c === color
                ? "ring-2 ring-fg ring-offset-2 ring-offset-[var(--color-card)]"
                : "hover:scale-110",
            )}
          />
        ))}
      </div>
    </div>
  );
}
