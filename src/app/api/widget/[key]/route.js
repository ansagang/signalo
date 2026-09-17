import { createServiceClient } from "@/lib/supabase/service";
import { panelTheme } from "@/lib/widget-theme";
import { resolveWidgetLocale, widgetStrings, resolveLauncherLabel } from "@/lib/widget-language";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, ngrok-skip-browser-warning",
  // The response depends on the visitor's own language, so anything caching
  // in between has to key on it rather than serve the first visitor's copy
  // to everyone behind it.
  Vary: "Accept-Language, Cookie",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Defaults live here so widget.js stays dumb and the dashboard owns the look. */
export const WIDGET_DEFAULTS = {
  accent: "#c9ced6",
  position: "right",
  offset: 20,
  size: 56,
  radius: 20,
  launcherLabel: "",
  // "orb" is the animated sphere; "button" is the classic round button.
  launcherStyle: "orb",
  // Second hue for the orb's swirl. Left empty it is derived from the accent.
  accent2: "",
  // How lively the orb is, and whether it carries a halo. Both exist because
  // "a moving thing in the corner" is a real complaint on a busy page.
  orbMotion: "alive",
  orbGlow: true,
  title: "Chat",
  subtitle: "",
  avatar: "",
  autoOpen: false,
  autoOpenDelay: 8,
  theme: "dark",
  greetingBubble: "",
  // "auto" follows the visitor's browser; a code pins the widget to one.
  language: "auto",
  // The assistant's icon belongs to the channel, so the same persona can be
  // branded differently on a website and in Telegram. Empty means no icon —
  // a real choice, not a missing value.
  avatarShape: "",
  // How much chrome the panel carries, and how tightly it is packed.
  headerStyle: "full",
  density: "cosy",
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

  // One finished palette, contrast-checked once here. Every consumer — the
  // launcher, the greeting bubble, the panel, the dashboard preview — reads
  // these instead of deriving its own and drifting apart, which is how a
  // white greeting bubble ended up hanging off a black widget.
  const theme = panelTheme(stored);

  // The launcher has words of its own — the label a screen reader announces,
  // and the iframe's title. They are resolved here rather than in widget.js,
  // which has no business carrying three dictionaries.
  const { data: profile } = await supabase
    .from("profiles")
    .select("lang")
    .eq("id", channel.user_id)
    .maybeSingle();

  const locale = resolveWidgetLocale({
    requested: new URL(request.url).searchParams.get("lang"),
    pinned: stored.language,
    cookieLocale: request.cookies.get("lang")?.value,
    acceptLanguage: request.headers.get("accept-language"),
    sellerLocale: profile?.lang,
  });
  const t = await widgetStrings(locale);

  return Response.json(
    {
      ok: true,
      config: {
        ...stored,
        title: stored.title || channel.name,
        locale,
        labelOpen: t.open,
        labelClose: t.close,
        // A preset becomes the visitor's own language here, so widget.js
        // never has to know a preset exists.
        launcherLabel: resolveLauncherLabel(stored.launcherLabel, t),
        subtitle: stored.subtitle || persona?.name || "",
        panelBg: theme.bg,
        panelText: theme.fg,
        panelSurface: theme.surface,
        panelBorder: theme.border,
        panelMuted: theme.muted,
        accent: theme.accent,
        accentInk: theme.accentInk,
        accentOnPanel: theme.accentOnPanel,
        isLight: theme.isLight,
      },
    },
    // No caching: a seller who changes the accent and reloads must see it
    // immediately. A minute of staleness read as "the button does not change".
    { headers: { ...CORS, "Cache-Control": "no-store" } },
  );
}
