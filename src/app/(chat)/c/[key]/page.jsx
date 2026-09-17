import { createServiceClient } from "@/lib/supabase/service";
import ChatShell from "@/components/chat/chat-shell";
import { panelTheme, paletteVars } from "@/lib/widget-theme";
import { canSpend } from "@/lib/services/billing";
import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { resolveWidgetLocale, widgetStrings } from "@/lib/widget-language";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * The customer-facing chat. Reached directly, or through an iframe injected
 * by /widget.js. The public key in the URL is the only credential; it maps to
 * exactly one channel and nothing else is trusted from the request.
 */
/**
 * Openers are stored as one text block because a list of inputs is a worse
 * thing to edit than a textarea. Blank lines and stray whitespace are the
 * normal result of typing one, so they are cleaned here rather than trusted.
 */
function parseStarters(raw) {
  return String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);
}

export default async function PublicChatPage({ params, searchParams }) {
  const { key } = await params;
  const { lang: requested } = (await searchParams) || {};
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

  const config = channel.config || {};
  const theme = panelTheme(config);

  // The visitor's own browser decides, unless the seller pinned a language.
  // Their profile is the last resort — a Kazakh salon with no signal from the
  // visitor is better served in Kazakh than in English.
  const { data: profile } = await supabase
    .from("profiles")
    .select("lang")
    .eq("id", channel.user_id)
    .maybeSingle();

  const locale = resolveWidgetLocale({
    requested,
    pinned: config.language,
    cookieLocale: (await cookies()).get("lang")?.value,
    acceptLanguage: (await headers()).get("accept-language"),
    sellerLocale: profile?.lang,
  });
  const t = await widgetStrings(locale);

  if (!channel.is_active || !persona) {
    return (
      <main className="h-dvh grid place-items-center px-6" style={{ ...paletteVars(theme), background: theme.bg }}>
        <div className="text-center">
          <p className="text-[15px] font-semibold text-fg mb-1">{t.offline}</p>
          <p className="text-[13px] text-muted">{t.offlineHint}</p>
        </div>
      </main>
    );
  }

  // Whether the assistant can answer at all. An account with no credits left
  // escalates every message to a person instead of replying, and the header
  // should say so rather than leaving a customer talking to nothing.
  const { ok: canReply } = await canSpend(supabase, channel.user_id);

  return (
    <ChatShell
      theme={theme}
      config={config}
      title={config.title || channel.name}
      status={canReply ? "assistant" : "paused"}
      t={t}
      panel={{
        publicKey: key,
        botShape: config.avatarShape,
        botAccent: theme.accent,
        greeting: persona.greeting,
        personaName: persona.name,
        density: config.density,
        starters: parseStarters(config.starters),
        locale,
        branded: true,
        origin: process.env.URL?.replace(/\/$/, "") || "",
      }}
    />
  );
}
