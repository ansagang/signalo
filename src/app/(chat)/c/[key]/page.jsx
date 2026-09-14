import { createServiceClient } from "@/lib/supabase/service";
import ChatPanel from "@/components/chat/chat-panel";
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
  const accent = /^#[0-9a-f]{3,8}$/i.test(config.accent || "") ? config.accent : null;

  return (
    // The accent chosen in the dashboard drives the whole panel, not just the
    // launcher — send button, customer bubbles and the header dot.
    <main
      className="h-dvh flex flex-col bg-bg"
      style={accent ? { "--color-accent": accent } : undefined}
    >
      <header className="flex items-center gap-3 px-4 py-3 border-b border-secondary-transparent shrink-0">
        <div className="size-9 rounded-button bg-secondary-transparent2 grid place-items-center text-[17px]">
          {persona.icon || "🤖"}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-fg truncate">{title}</p>
          <p className="text-[11px] text-muted flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-accent animate-pulse" />
            {persona.name}
          </p>
        </div>
      </header>

      <ChatPanel
        publicKey={key}
        greeting={persona.greeting}
        personaName={persona.name}
        personaIcon={persona.icon || "🤖"}
        className="flex-1 min-h-0"
      />
    </main>
  );
}
