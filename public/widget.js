/**
 * Signalo embeddable chat widget.
 *
 *   <script src="https://YOUR-DOMAIN/widget.js" data-key="sg_live_..." defer></script>
 *
 * Everything about how it looks is configured in the dashboard and fetched at
 * runtime, so changing the colour or position never means editing the snippet
 * on a customer's site. data-* attributes still win if present, for anyone who
 * wants to override per page.
 */
(function () {
  "use strict";

  var script =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName("script");
      for (var i = all.length - 1; i >= 0; i--) {
        if (all[i].src && all[i].src.indexOf("widget.js") !== -1) return all[i];
      }
      return null;
    })();

  if (!script) return;

  var key = script.getAttribute("data-key");
  if (!key) {
    console.error("[signalo] widget.js needs a data-key attribute");
    return;
  }
  if (window.__signaloWidgetLoaded) return;
  window.__signaloWidgetLoaded = true;

  var origin = new URL(script.src, window.location.href).origin;

  var DEFAULTS = {
    accent: "#00d26a", position: "right", offset: 20, size: 56, radius: 16,
    launcherLabel: "", title: "Chat", subtitle: "", avatar: "",
    autoOpen: false, autoOpenDelay: 8, theme: "dark", greetingBubble: "",
  };

  function attr(name) {
    var v = script.getAttribute("data-" + name);
    return v === null ? undefined : v;
  }

  function boot(config) {
    // data-* overrides whatever the dashboard says.
    var over = {
      accent: attr("accent"), position: attr("position"), title: attr("title"),
      launcherLabel: attr("label"), offset: attr("offset"), size: attr("size"),
      radius: attr("radius"), greetingBubble: attr("greeting"),
    };
    for (var k in over) if (over[k] !== undefined && over[k] !== "") config[k] = over[k];

    var side = config.position === "left" ? "left" : "right";
    var offset = parseInt(config.offset, 10) || 20;
    var size = parseInt(config.size, 10) || 56;
    var radius = parseInt(config.radius, 10) || 16;
    var open = false;
    var dismissedGreeting = false;

    var launcher = document.createElement("button");
    launcher.type = "button";
    launcher.setAttribute("aria-label", config.title || "Chat");
    launcher.style.cssText = [
      "position:fixed", "bottom:" + offset + "px", side + ":" + offset + "px",
      "min-width:" + size + "px", "height:" + size + "px",
      "border-radius:" + Math.round(size / 2) + "px", "border:none", "cursor:pointer",
      "background:" + config.accent, "box-shadow:0 6px 24px rgba(0,0,0,.28)",
      "z-index:2147483646", "display:inline-flex", "align-items:center", "gap:8px",
      "justify-content:center", "transition:transform .18s ease", "padding:0 " + (config.launcherLabel ? "18px" : "0"),
      "font:600 14px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif", "color:#000",
    ].join(";");

    var ICON_CHAT =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
    var ICON_CLOSE =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

    function paintLauncher() {
      if (open) { launcher.innerHTML = ICON_CLOSE; return; }
      var avatar = config.avatar
        ? '<span style="font-size:22px;line-height:1">' + config.avatar + "</span>"
        : ICON_CHAT;
      launcher.innerHTML = avatar + (config.launcherLabel
        ? '<span style="white-space:nowrap">' + config.launcherLabel + "</span>" : "");
    }

    launcher.onmouseenter = function () { launcher.style.transform = "scale(1.06)"; };
    launcher.onmouseleave = function () { launcher.style.transform = "scale(1)"; };

    var frame = document.createElement("iframe");
    frame.src = origin + "/c/" + encodeURIComponent(key);
    frame.title = config.title || "Chat";
    frame.style.cssText = [
      "position:fixed", "border:none", "z-index:2147483645", "display:none",
      "background:transparent", "overflow:hidden",
      "box-shadow:0 12px 48px rgba(0,0,0,.32)", "border-radius:" + radius + "px",
    ].join(";");

    // A one-line nudge that appears before anyone clicks.
    var bubble = null;
    if (config.greetingBubble) {
      bubble = document.createElement("div");
      bubble.textContent = config.greetingBubble;
      bubble.style.cssText = [
        "position:fixed", "bottom:" + (offset + size + 12) + "px", side + ":" + offset + "px",
        "max-width:240px", "padding:10px 14px", "border-radius:14px",
        "background:#fff", "color:#111", "box-shadow:0 6px 24px rgba(0,0,0,.22)",
        "font:500 13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
        "z-index:2147483646", "cursor:pointer",
      ].join(";");
      bubble.addEventListener("click", function () { setOpen(true); });
    }

    function layout() {
      var narrow = window.innerWidth <= 480;
      if (narrow) {
        frame.style.width = "100vw";
        frame.style.height = "100dvh";
        frame.style.bottom = "0";
        frame.style[side] = "0";
        frame.style.borderRadius = "0";
        frame.style.maxWidth = "100vw";
      } else {
        frame.style.width = "384px";
        frame.style.height = "min(640px, calc(100dvh - " + (offset * 2 + size + 16) + "px))";
        frame.style.bottom = offset + size + 12 + "px";
        frame.style[side] = offset + "px";
        frame.style.borderRadius = radius + "px";
        frame.style.maxWidth = "calc(100vw - " + offset * 2 + "px)";
      }
    }

    function setOpen(next) {
      open = next;
      frame.style.display = open ? "block" : "none";
      paintLauncher();
      if (bubble && open) { bubble.remove(); dismissedGreeting = true; }
      try {
        window.localStorage.setItem("signalo:" + key + ":opened", "1");
      } catch (e) { /* private mode */ }
    }

    launcher.addEventListener("click", function () { setOpen(!open); });
    window.addEventListener("resize", layout);

    function mount() {
      document.body.appendChild(frame);
      document.body.appendChild(launcher);
      paintLauncher();
      layout();

      var seen = false;
      try { seen = window.localStorage.getItem("signalo:" + key + ":opened") === "1"; } catch (e) {}

      if (bubble && !seen) {
        setTimeout(function () {
          if (!open && !dismissedGreeting) document.body.appendChild(bubble);
        }, 2500);
      }
      if (config.autoOpen && !seen) {
        setTimeout(function () { if (!open) setOpen(true); },
          (parseInt(config.autoOpenDelay, 10) || 8) * 1000);
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mount);
    } else {
      mount();
    }

    window.Signalo = {
      open: function () { setOpen(true); },
      close: function () { setOpen(false); },
      toggle: function () { setOpen(!open); },
      config: config,
    };
  }

  // Look comes from the dashboard; if it cannot be reached the widget still works.
  fetch(origin + "/api/widget/" + encodeURIComponent(key), {
    // ngrok's free tier answers browser requests with an HTML interstitial —
    // a 200 that is not our JSON — which silently reverted every page to the
    // default look. This header is ngrok's documented opt-out and is ignored
    // by every other host.
    headers: { "ngrok-skip-browser-warning": "true" },
  })
    .then(function (r) {
      if (!r.ok) return null;
      var type = r.headers.get("content-type") || "";
      // Guard against any proxy that returns HTML with a 200.
      return type.indexOf("application/json") === -1 ? null : r.json();
    })
    .then(function (body) {
      boot(body && body.ok ? Object.assign({}, DEFAULTS, body.config) : Object.assign({}, DEFAULTS));
    })
    .catch(function () { boot(Object.assign({}, DEFAULTS)); });
})();
