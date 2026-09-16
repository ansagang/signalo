import { createServiceClient } from "@/lib/supabase/service";
import ChatPanel from "@/components/chat/chat-panel";
import Orb from "@/components/chat/orb";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * The customer-facing chat. Reached directly, or through an iframe injected
 * by /widget.js. The public key in the URL is the only credential; it maps to
 * exactly one channel and nothing else is trusted from the request.
 */
export default async function PublicChatPage({ params }) {
  const { key } = await params;
  const supabase = createServiceClient();

  const { data: channel } = await supabase
    .from("channels")
    .select("id, persona_id, user_id, name, config, is_active, type")
    .eq("public_key", key)
    .maybeSingle();

  if (!channel) notFound();

  const { data: persona } = await supabase
    .from("personas")
    .select("name, icon, greeting")
    .eq("id", channel.persona_id)
    .eq("user_id", channel.user_id)
    .maybeSingle();

  if (!channel.is_active || !persona) {
    return (
      <main className="h-dvh grid place-items-center bg-bg px-6">
        <div className="text-center">
          <p className="text-h4 text-fg mb-1">Currently offline</p>
          <p className="info-2 text-sm">Please try again later.</p>
        </div>
      </main>
    );
  }

  const config = channel.config || {};
  const title = config.title || channel.name;

  const THEMES = {
    dark:  { panelBg: "#0a0a0c", panelText: "#f4f4f6", panelSurface: "#1c1c22", panelBorder: "#2a2a32" },
    light: { panelBg: "#ffffff", panelText: "#14141a", panelSurface: "#f1f1f4", panelBorder: "#e3e3e9" },
  };
  const theme = THEMES[config.theme] || THEMES.dark;
  const hex = (v) => (/^#[0-9a-f]{3,8}$/i.test(v || "") ? v : null);

  // Drive the design tokens the panel is already built on, so bubbles, input,
  // borders and buttons all follow the seller's colours without each needing
  // its own override.
  const palette = {
    "--color-accent": hex(config.accent) || "#c9ced6",
    "--color-bg": hex(config.panelBg) || theme.panelBg,
    "--color-fg": hex(config.panelText) || theme.panelText,
    "--color-secondary-transparent2": hex(config.panelSurface) || theme.panelSurface,
    "--color-secondary-transparent": theme.panelBorder,
    "--color-primary": hex(config.panelBg) || theme.panelBg,
  };

  return (
    // The accent chosen in the dashboard drives the whole panel, not just the
    // launcher — send button, customer bubbles and the header dot.
    <main className="h-dvh flex flex-col bg-bg" style={palette}>
      {/* The orb from the launcher again, so the thing they clicked and the
          thing now talking are obviously the same. */}
      <header className="relative flex items-center gap-3 px-4 py-3.5 shrink-0 overflow-hidden">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 h-40 opacity-[0.18]"
          style={{
            background: `radial-gradient(60% 70% at 18% 100%, ${palette["--color-accent"]} 0%, transparent 70%)`,
          }}
        />
        <Orb
          accent={palette["--color-accent"]}
          accent2={hex(config.accent2) || ""}
          motion={config.orbMotion}
          live={config.orbGlow !== false}
          size={38}
          className="relative"
        />
        <div className="min-w-0 relative">
          <p className="text-[13.5px] font-semibold text-fg truncate leading-tight">{title}</p>
          <p className="text-[11px] text-fg/55 flex items-center gap-1.5 mt-0.5">
            <span className="size-1.5 rounded-full bg-accent" />
            {persona.name}
          </p>
        </div>
      </header>
      <div className="h-px bg-gradient-to-r from-transparent via-[var(--color-secondary-transparent)] to-transparent shrink-0" />

      <ChatPanel
        publicKey={key}
        botShape={config.avatarShape}
        botAccent={palette["--color-accent"]}
        greeting={persona.greeting}
        personaName={persona.name}
        className="flex-1 min-h-0"
      />
    </main>
  );
}
