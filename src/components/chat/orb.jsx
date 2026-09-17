"use client";

/**
 * The same orb the launcher uses, as a React component.
 *
 * Kept visually identical on purpose: the thing a visitor clicks and the thing
 * that then talks to them should obviously be the same thing.
 */
export default function Orb({
  accent = "#c9ced6",
  accent2 = "",
  motion = "alive",
  size = 36,
  className = "",
  live = false,
}) {
  const rgb = (hex) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return [120, 120, 130];
    let h = m[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
  };
  const shade = (hex, amount) => {
    const target = amount > 0 ? 255 : 0;
    const t = Math.abs(amount);
    return `rgb(${rgb(hex).map((v) => Math.round(v + (target - v) * t)).join(",")})`;
  };
  const alpha = (hex, a) => `rgba(${rgb(hex).join(",")},${a})`;

  // How fast the swirl turns, in seconds. "still" stops it outright, which is
  // the right answer on a page that is already busy.
  const spin = { alive: 14, calm: 30, still: 0 }[motion] ?? 14;

  // A partner hue keeps the swirl from being a flat wash of one colour. The
  // rotation is small on purpose: a wider one sent an orange accent into
  // yellow-green, which is nobody's brand. An explicit second colour wins.
  const hue = accent2 || (() => {
    const [r, g, b] = rgb(accent).map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    const sat = d ? (l > 0.5 ? d / (2 - max - min) : d / (max + min)) : 0;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    // A near-grey accent stays grey rather than growing a colour of its own.
    if (sat < 0.16) return `hsl(${Math.round(h)},6%,${Math.round(Math.min(l + 0.22, 0.92) * 100)}%)`;
    return `hsl(${Math.round((h + 26) % 360)},${Math.round(sat * 100)}%,64%)`;
  })();

  return (
    <span
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {live && spin > 0 && (
        <span
          className="absolute rounded-full animate-[orbBreathe_4.5s_ease-in-out_infinite] pointer-events-none"
          style={{
            inset: "-26%",
            filter: "blur(10px)",
            background: `radial-gradient(circle, ${alpha(accent, 0.8)} 0%, ${alpha(accent, 0)} 70%)`,
          }}
        />
      )}
      <span
        className="absolute inset-0 rounded-full overflow-hidden isolate"
        style={{
          background: `radial-gradient(circle at 32% 26%, ${shade(accent, 0.42)} 0%, ${accent} 46%, ${shade(accent, -0.42)} 100%)`,
          boxShadow: `0 6px 18px ${alpha(accent, 0.35)}, 0 1px 4px rgba(0,0,0,.3)`,
        }}
      >
        <span
          className="absolute will-change-transform"
          style={{
            inset: "-35%",
            opacity: 0.85,
            transform: "translateZ(0)",
            animation: spin ? `orbSpin ${spin}s linear infinite` : "none",
            background: `conic-gradient(from 0deg, ${alpha(accent, 0)}, ${hue}, ${alpha(accent, 0)}, ${shade(accent, 0.42)}, ${alpha(accent, 0)})`,
          }}
        />
        <span
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 32% 22%, rgba(255,255,255,.85) 0%, rgba(255,255,255,.22) 24%, transparent 50%)",
            boxShadow: "inset 0 1px 1px rgba(255,255,255,.45), inset 0 -6px 12px rgba(0,0,0,.26)",
          }}
        />
      </span>
    </span>
  );
}
