"use client";

import { cn } from "@/lib/utils";
import { MailIcon, SparklesIcon, MessageSquareIcon } from "lucide-react";
import { InstagramIcon, TelegramIcon, WhatsAppIcon, WidgetIcon } from "@/components/ui/brand-icons";

/**
 * One visual identity per channel, used everywhere a conversation is shown.
 *
 * Every surface used to invent its own mapping, so a WhatsApp chat was green
 * in the list, blue in the header and unlabelled in the overview. The tint is
 * the channel's own colour, kept faint — it identifies the source at a glance
 * without competing with the app's own accent.
 */
const LOOKS = {
  webchat:   { Icon: WidgetIcon,     tint: "text-[#9aa3b2]" },
  telegram:  { Icon: TelegramIcon,   tint: "text-[#4aa3e0]" },
  whatsapp:  { Icon: WhatsAppIcon,   tint: "text-[#4aa87a]" },
  instagram: { Icon: InstagramIcon,  tint: "text-[#d06a9c]" },
  email:     { Icon: MailIcon,       tint: "text-[#a39ad0]" },
  playground:{ Icon: SparklesIcon,   tint: "text-accent" },
};

export function channelLook(channel) {
  return LOOKS[channel] || { Icon: MessageSquareIcon, tint: "text-muted" };
}

/** The customer's initials with their channel marked in the corner. */
export function ChannelAvatar({ channel, initials, size = 36, className }) {
  const { Icon, tint } = channelLook(channel);
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <div
        className="size-full rounded-full bg-secondary-transparent2 border border-secondary-transparent grid place-items-center font-semibold text-secondary"
        style={{ fontSize: Math.round(size * 0.3) }}
      >
        {initials}
      </div>
      <span
        className="absolute -bottom-0.5 -right-0.5 rounded-full bg-card border border-border grid place-items-center"
        style={{ width: size * 0.45, height: size * 0.45 }}
      >
        <Icon className={tint} style={{ width: size * 0.26, height: size * 0.26 }} />
      </span>
    </div>
  );
}

/** The channel on its own — a glyph and its name. */
export function ChannelTag({ channel, label, className }) {
  const { Icon, tint } = channelLook(channel);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Icon className={cn("size-3.5", tint)} />
      {label}
    </span>
  );
}
