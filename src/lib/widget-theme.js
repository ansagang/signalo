/**
 * The widget's colours, decided in one place.
 *
 * Sellers were handed four independent colour pickers — background, text,
 * surface and accent — and any two of them could be set to the same value.
 * That is how a panel ends up with invisible text, and no amount of care in
 * the components can rescue it afterwards.
 *
 * So the seller states intent (a theme, an accent, optionally a background)
 * and everything else is derived and contrast-checked here. Overrides are
 * still honoured, but only while they stay readable; past that they are
 * pulled back toward something that works. The result is a finished palette
 * that the launcher, the panel, the hosted page and the dashboard preview all
 * read, rather than each re-deriving its own.
 */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function toRgb(hex, fallback = [20, 20, 26]) {
  const m = HEX.exec(String(hex || ""));
  if (!m) return fallback;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
export const toHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** Relative luminance, as the contrast maths defines it. */
export function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours: 1 (identical) to 21 (black on white). */
export function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Readable ink for a background.
 *
 * Whichever of black or white actually wins, rather than a lightness cutoff.
 * A cutoff put white on #0090ff at 3.3:1 — below the readable minimum —
 * because mid-tone colours sit on the wrong side of any fixed threshold.
 * Picking the better of the two can never do worse than 4.58:1.
 */
export function inkOn(background) {
  const dark = "#0a0a0c";
  const light = "#ffffff";
  return contrast(dark, background) >= contrast(light, background) ? dark : light;
}

/** Move `hex` `amount` of the way toward `target`. */
export function mix(hex, target, amount) {
  const a = toRgb(hex);
  const b = toRgb(target);
  return toHex(a.map((v, i) => v + (b[i] - v) * amount));
}

export function rgba(hex, alpha) {
  return `rgba(${toRgb(hex).join(",")},${alpha})`;
}

/**
 * Nudge `colour` away from `against` until it is legible.
 *
 * Used on values a seller typed by hand. It keeps their hue and only spends
 * lightness, so "my brand blue" stays recognisably their blue.
 */
function legible(colour, against, ratio) {
  if (contrast(colour, against) >= ratio) return colour;

  const toward = luminance(against) > 0.42 ? "#000000" : "#ffffff";
  for (let step = 0.08; step <= 1; step += 0.08) {
    const candidate = mix(colour, toward, step);
    if (contrast(candidate, against) >= ratio) return candidate;
  }
  return toward;
}

export const WIDGET_THEMES = {
  dark:  { bg: "#0a0a0c", fg: "#f4f4f6" },
  light: { bg: "#ffffff", fg: "#14141a" },
};

/**
 * Turn stored channel config into a finished palette.
 *
 * Every consumer calls this, so the launcher, the greeting bubble, the panel
 * and the dashboard preview cannot drift apart — which they had, leaving a
 * white greeting bubble hanging off a black widget.
 */
export function panelTheme(config = {}) {
  const base = WIDGET_THEMES[config.theme] || WIDGET_THEMES.dark;

  const bg = HEX.test(config.panelBg || "") ? config.panelBg : base.bg;
  const isLight = luminance(bg) > 0.42;

  // Text must clear 7:1 against its own background. Chat is read at 13px, and
  // the 4.5:1 minimum is visibly tiring at that size.
  const fg = legible(
    HEX.test(config.panelText || "") ? config.panelText : base.fg,
    bg,
    7,
  );

  // The raised surface — bubbles, the composer, cards. Derived as a small step
  // from the background so it reads as the same material, lit differently.
  const surface = HEX.test(config.panelSurface || "")
    ? config.panelSurface
    : mix(bg, fg, isLight ? 0.06 : 0.09);

  const accent = HEX.test(config.accent || "") ? config.accent : "#c9ced6";

  return {
    isLight,
    bg,
    fg,
    surface,
    // One step further for anything that sits on top of a surface.
    surfaceStrong: mix(surface, fg, 0.06),
    border: mix(bg, fg, isLight ? 0.12 : 0.16),
    hairline: rgba(fg, isLight ? 0.08 : 0.1),
    muted: mix(bg, fg, 0.55),
    secondary: mix(bg, fg, 0.72),
    accent,
    // What text on the accent must be. A silver accent needs dark ink; a navy
    // one needs white — and the seller should never have to think about it.
    accentInk: inkOn(accent),
    // The accent as the seller sees it against their own panel. A white accent
    // on a white panel is invisible, so links and glows use this instead.
    accentOnPanel: legible(accent, bg, 3),
  };
}

/** The same palette as CSS custom properties the app's tokens already use. */
export function paletteVars(theme) {
  return {
    "--color-bg": theme.bg,
    "--color-primary": theme.bg,
    "--color-fg": theme.fg,
    "--color-card": theme.surface,
    "--color-accent": theme.accent,
    // The tested ink for anything filled with the accent. Without it a bubble
    // has to guess, and a mid-tone brand colour is exactly where guessing
    // produces white-on-orange.
    "--color-accent-ink": theme.accentInk,
    "--color-accent-on-panel": theme.accentOnPanel,
    "--color-muted": theme.muted,
    "--color-secondary": theme.secondary,
    "--color-border": theme.border,
    "--color-secondary-transparent": theme.hairline,
    "--color-secondary-transparent2": rgba(theme.fg, theme.isLight ? 0.05 : 0.06),
  };
}
