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

  const config = { ...WIDGET_DEFAULTS, ...(channel.config || {}) };

  return Response.json(
    {
      ok: true,
      config: {
        ...config,
        title: config.title || channel.name,
        subtitle: config.subtitle || persona?.name || "",
        avatar: config.avatar || persona?.icon || "",
      },
    },
    { headers: { ...CORS, "Cache-Control": "public, max-age=60" } },
  );
}
