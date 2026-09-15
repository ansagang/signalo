import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, ngrok-skip-browser-warning",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Defaults live here so widget.js stays dumb and the dashboard owns the look. */
export const WIDGET_THEMES = {
  dark:  { panelBg: "#0a0a0c", panelText: "#f4f4f6", panelSurface: "#1c1c22", panelBorder: "#2a2a32" },
  light: { panelBg: "#ffffff", panelText: "#14141a", panelSurface: "#f1f1f4", panelBorder: "#e3e3e9" },
};

export const WIDGET_DEFAULTS = {
  accent: "#00d26a",
  position: "right",
  offset: 20,
  size: 56,
  radius: 16,
  launcherLabel: "",
  title: "Chat",
  subtitle: "",
  avatar: "",
  autoOpen: false,
  autoOpenDelay: 8,
  theme: "dark",
  greetingBubble: "",
  // The assistant's icon belongs to the channel, so the same persona can be
  // branded differently on a website and in Telegram.
  avatarShape: "bot",
  // Panel colours. Left unset they follow the chosen theme, so a seller who
  // only picks an accent still gets a coherent window.
  panelBg: null,
  panelText: null,
  panelSurface: null,
};

/**
 * Public launcher config for one channel.
 *
 * Only presentation is exposed — never the persona prompt, never secrets.
 * The page inside the iframe does its own lookup for the rest.
 */
export async function GET(request, { params }) {
  const { key } = await params;
  const supabase = createServiceClient();

  const { data: channel } = await supabase
    .from("channels")
    .select("name, config, is_active, persona_id, user_id")
    .eq("public_key", key)
    .maybeSingle();

  if (!channel || !channel.is_active) {
    return Response.json({ ok: false }, { status: 404, headers: CORS });
  }

  const { data: persona } = await supabase
    .from("personas")
    .select("name, icon")
    .eq("id", channel.persona_id)
    .eq("user_id", channel.user_id)
    .maybeSingle();

  const stored = { ...WIDGET_DEFAULTS, ...(channel.config || {}) };
  const theme = WIDGET_THEMES[stored.theme] || WIDGET_THEMES.dark;

  // Resolve the theme here so every consumer — launcher, chat page, preview —
  // reads the same finished values instead of each re-deriving them.
  const config = {
    ...stored,
    panelBg: stored.panelBg || theme.panelBg,
    panelText: stored.panelText || theme.panelText,
    panelSurface: stored.panelSurface || theme.panelSurface,
    panelBorder: theme.panelBorder,
  };

  return Response.json(
    {
      ok: true,
      config: {
        ...config,
        title: config.title || channel.name,
        subtitle: config.subtitle || persona?.name || "",
        // emoji pass straight through; icon presets become shape + colour
        avatarShape: config.avatarShape || "bot",
      },
    },
    { headers: { ...CORS, "Cache-Control": "public, max-age=60" } },
  );
}
