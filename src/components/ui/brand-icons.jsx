/**
 * Channel glyphs.
 *
 * lucide-react dropped its brand icons, and the generic stand-ins that
 * replaced them (a send arrow for Telegram, a speech bubble for WhatsApp)
 * made three different channels look like the same thing in the inbox. These
 * are drawn to lucide's conventions — 24px box, `currentColor`, the same
 * stroke width — so they drop into any place a lucide icon goes.
 */

function Svg({ children, filled, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function InstagramIcon(props) {
  return (
    <Svg {...props}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function TelegramIcon(props) {
  return (
    <Svg {...props} filled>
      {/* The paper plane with its folded wing, as one path. */}
      <path d="M21.7 3.3a1 1 0 0 0-1.05-.16L2.9 10.5c-.83.35-.8 1.54.05 1.84l4.2 1.48 1.62 4.92c.26.79 1.27.99 1.81.36l2.2-2.56 4.26 3.13c.6.44 1.46.13 1.63-.6l3.3-14.7a1 1 0 0 0-.27-1.07ZM9.3 13.4l8.2-5.1-6.6 6.2a1 1 0 0 0-.3.56l-.35 2.03-.95-3.69Z" />
    </Svg>
  );
}

export function WhatsAppIcon(props) {
  return (
    <Svg {...props} filled>
      <path d="M12 2a10 10 0 0 0-8.6 15.07L2 22l5.05-1.32A10 10 0 1 0 12 2Zm0 2a8 8 0 1 1-4.1 14.87l-.3-.18-2.6.68.7-2.53-.2-.32A8 8 0 0 1 12 4Z" />
      <path d="M9.1 7.4c-.2-.45-.4-.46-.6-.47h-.5a1 1 0 0 0-.72.34c-.25.27-.95.93-.95 2.26s.97 2.62 1.1 2.8c.14.18 1.9 3.02 4.68 4.11 2.3.91 2.77.73 3.27.68.5-.04 1.62-.66 1.85-1.3.23-.64.23-1.19.16-1.3-.07-.12-.25-.19-.53-.33-.27-.13-1.62-.8-1.87-.89-.25-.09-.43-.13-.62.14-.18.27-.7.89-.86 1.07-.16.18-.32.2-.59.07-.27-.14-1.15-.43-2.2-1.36-.81-.72-1.36-1.62-1.52-1.89-.16-.27-.02-.42.12-.55.12-.12.27-.32.4-.48.14-.16.18-.27.28-.46.09-.18.04-.34-.02-.48-.07-.13-.6-1.48-.84-2.03Z" />
    </Svg>
  );
}

export function WidgetIcon(props) {
  return (
    <Svg {...props}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Svg>
  );
}
