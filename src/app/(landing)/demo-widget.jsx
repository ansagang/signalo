"use client";

import { useEffect, useRef } from "react";

/**
 * The live assistant on the marketing page.
 *
 * `next/script` was fine at putting the widget on the page and no good at
 * taking it off: navigating to /login without a reload left the launcher
 * pinned to the corner of every page after it, because the script had already
 * run and its nodes belong to document.body, not to React.
 *
 * It also has to follow the site's language switcher. The panel is a separate
 * document, so changing the cookie does nothing to a frame that has already
 * loaded — the widget is told directly instead.
 */
export default function DemoWidget({ widgetKey, lang }) {
  const mounted = useRef(false);

  useEffect(() => {
    if (!widgetKey) return undefined;

    const script = document.createElement("script");
    script.src = "/widget.js";
    script.async = true;
    script.dataset.key = widgetKey;
    if (lang) script.dataset.lang = lang;
    document.body.appendChild(script);
    mounted.current = true;

    return () => {
      // The script may still be in flight when the route changes; removing the
      // tag stops a widget appearing on the page we just left for.
      script.remove();
      window.Signalo?.destroy?.();
      mounted.current = false;
    };
    // Deliberately not keyed on `lang`: switching language should not tear the
    // widget down and lose an open conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetKey]);

  useEffect(() => {
    if (!lang || !mounted.current) return;
    window.Signalo?.setLanguage?.(lang);
  }, [lang]);

  return null;
}
