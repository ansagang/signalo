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
    accent: "#c9ced6", position: "right", offset: 20, size: 56, radius: 16,
    launcherLabel: "", title: "Chat", subtitle: "", avatarShape: "bot",
    autoOpen: false, autoOpenDelay: 8, theme: "dark", greetingBubble: "",
    // The launcher's own look. accent2 empty means "derive it from accent".
    launcherStyle: "orb", accent2: "", orbMotion: "alive", orbGlow: true,
  };

  function attr(name) {
    var v = script.getAttribute("data-" + name);
    return v === null ? undefined : v;
  }

  /** Readable ink for a background — accents range from near-white to near-black. */
  function inkOn(hex) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return "#000";
    var h = m[1];
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var parts = [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16) / 255; });
    var lin = function (c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    var l = 0.2126 * lin(parts[0]) + 0.7152 * lin(parts[1]) + 0.0722 * lin(parts[2]);
    return l > 0.45 ? "#0a0a0c" : "#ffffff";
  }

  /** "#00d26a" → [0,210,106]. Falls back to a mid grey rather than throwing. */
  function rgb(hex) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return [120, 120, 130];
    var h = m[1];
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); });
  }

  /** Lighten (amount > 0) or darken (< 0) toward white/black. */
  function shade(hex, amount) {
    var c = rgb(hex);
    var target = amount > 0 ? 255 : 0;
    var t = Math.abs(amount);
    return "rgb(" + c.map(function (v) {
      return Math.round(v + (target - v) * t);
    }).join(",") + ")";
  }

  function rgba(hex, alpha) {
    return "rgba(" + rgb(hex).join(",") + "," + alpha + ")";
  }

  /**
   * A second hue for the swirl.
   *
   * Rotating the accent around the colour wheel keeps the orb alive without
   * asking the seller to pick two colours that go together.
   */
  function partner(hex) {
    var c = rgb(hex).map(function (v) { return v / 255; });
    var max = Math.max.apply(null, c), min = Math.min.apply(null, c);
    var l = (max + min) / 2, d = max - min, h = 0, sat = 0;
    if (d) {
      sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === c[0]) h = ((c[1] - c[2]) / d) % 6;
      else if (max === c[1]) h = (c[2] - c[0]) / d + 2;
      else h = (c[0] - c[1]) / d + 4;
      h *= 60;
    }
    // A near-grey accent must stay grey. Forcing saturation here put a purple
    // swirl inside a silver logo's orb.
    if (sat < 0.16) return "hsl(" + Math.round(h) + ",6%," + Math.round(Math.min(l + 0.22, 0.92) * 100) + "%)";
    return "hsl(" + Math.round((h + 48) % 360) + "," + Math.round(sat * 100) + "%,62%)";
  }

  /** Injected once; the orb is pure CSS so the widget stays dependency-free. */
  function styleOnce(css) {
    if (document.getElementById("signalo-style")) return;
    var el = document.createElement("style");
    el.id = "signalo-style";
    el.textContent = css;
    document.head.appendChild(el);
  }

  function boot(config) {
    // data-* overrides whatever the dashboard says.
    var over = {
      accent: attr("accent"), position: attr("position"), title: attr("title"),
      launcherLabel: attr("label"), offset: attr("offset"), size: attr("size"),
      radius: attr("radius"), greetingBubble: attr("greeting"),
      launcherStyle: attr("launcher"), accent2: attr("accent2"),
      orbMotion: attr("motion"),
    };
    for (var k in over) if (over[k] !== undefined && over[k] !== "") config[k] = over[k];

    var side = config.position === "left" ? "left" : "right";
    var offset = parseInt(config.offset, 10) || 20;
    var size = parseInt(config.size, 10) || 56;
    var radius = parseInt(config.radius, 10) || 16;
    var open = false;
    var dismissedGreeting = false;

    var orbMode = (config.launcherStyle || "orb") !== "button";
    // The orb carries a gradient, a swirl and a glyph; under about 44px those
    // read as mud. The classic button is happy small, so only clamp the orb.
    var orbSize = Math.min(Math.max(size, 44), 96);
    var hasLabel = Boolean(config.launcherLabel);
    var accent2 = config.accent2 || partner(config.accent);

    // How lively the orb is. "still" is not a lesser option — on a busy page a
    // moving object in the corner is the thing people complain about.
    var MOTION = { alive: 14, calm: 30, still: 0 };
    var spin = MOTION[config.orbMotion] === undefined ? 14 : MOTION[config.orbMotion];
    var glow = config.orbGlow !== false && spin > 0;

    styleOnce([
      "@keyframes sg-spin{to{transform:rotate(360deg)}}",
      // The halo breathes rather than pulses: a heartbeat in the corner of the
      // eye is distracting, a slow swell reads as alive.
      "@keyframes sg-breathe{0%,100%{opacity:.45}50%{opacity:.8}}",
      
      ".sg-orb{position:relative;display:inline-flex;align-items:center;justify-content:center;border:none;",
      "background:transparent;cursor:pointer;padding:0;-webkit-tap-highlight-color:transparent;",
      "transition:transform .25s cubic-bezier(.2,.9,.3,1.2)}",
      ".sg-orb:hover{transform:scale(1.05)}",
      ".sg-orb:active{transform:scale(.97)}",
      ".sg-orbwrap{position:relative;display:inline-block;flex:none}",
      ".sg-ball{position:absolute;inset:0;border-radius:50%;overflow:hidden;isolation:isolate}",
      ".sg-swirl{position:absolute;inset:-35%;opacity:.85;will-change:transform;transform:translateZ(0);",
      spin ? "animation:sg-spin " + spin + "s linear infinite}" : "}",
      
      ".sg-gloss{position:absolute;inset:0;border-radius:50%;pointer-events:none}",
      ".sg-rim{position:absolute;inset:0;border-radius:50%;pointer-events:none;",
      "box-shadow:inset 0 1px 1px rgba(255,255,255,.45),inset 0 -8px 14px rgba(0,0,0,.28)}",
      ".sg-halo{position:absolute;inset:-28%;border-radius:50%;filter:blur(14px);z-index:-1;",
      "pointer-events:none;will-change:opacity;",
      glow ? "animation:sg-breathe 5s ease-in-out infinite}" : "opacity:.5}",
      ".sg-glyph{position:absolute;inset:0;display:grid;place-items:center;z-index:2;transition:opacity .2s}",
      ".sg-pill{display:inline-flex;align-items:center;gap:10px;padding:6px 18px 6px 6px;border-radius:999px;",
      "backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}",
      "@media (prefers-reduced-motion:reduce){.sg-swirl,.sg-halo{animation:none}}",
    ].join(""));

    var launcher = document.createElement("button");
    launcher.type = "button";
    launcher.setAttribute("aria-label", config.title || "Chat");
    launcher.className = orbMode ? "sg-orb" : "";

    if (orbMode) {
      launcher.style.cssText = [
        "position:fixed", "bottom:" + offset + "px", side + ":" + offset + "px",
        "z-index:2147483646",
        "font:600 14px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
      ].join(";");
    } else {
      launcher.style.cssText = [
        "position:fixed", "bottom:" + offset + "px", side + ":" + offset + "px",
        "min-width:" + size + "px", "height:" + size + "px",
        "border-radius:" + Math.round(size / 2) + "px", "border:none", "cursor:pointer",
        "background:" + config.accent, "box-shadow:0 6px 24px rgba(0,0,0,.28)",
        "z-index:2147483646", "display:inline-flex", "align-items:center", "gap:8px",
        "justify-content:center", "transition:transform .18s ease", "padding:0 " + (hasLabel ? "18px" : "0"),
        "font:600 14px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
        "color:" + inkOn(config.accent),
      ].join(";");
    }

    // The same shapes the dashboard offers. Generated from lucide-react by
    // scripts/gen-widget-shapes.mjs rather than drawn by hand: hand-traced
    // approximations were not centred in the 24x24 grid, so the glyph sat
    // visibly high inside the round button.
    var SHAPES = {
      bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
      sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
      message: '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>',
      headset: '<path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"/><path d="M21 16v2a4 4 0 0 1-4 4h-5"/>',
      bag: '<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>',
      scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
      heart: '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>',
      star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
      zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
      coffee: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
      gem: '<path d="M10.5 3 8 9l4 13 4-13-2.5-6"/><path d="M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z"/><path d="M2 9h20"/>',
      flower: '<circle cx="12" cy="12" r="3"/><path d="M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5"/><path d="M12 7.5V9"/><path d="M7.5 12H9"/><path d="M16.5 12H15"/><path d="M12 16.5V15"/><path d="m8 8 1.88 1.88"/><path d="M14.12 9.88 16 8"/><path d="m8 16 1.88-1.88"/><path d="M14.12 14.12 16 16"/>',
      wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/>',
      package: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
      smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
      crown: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
      leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
      rocket: '<path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09"/><path d="M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05"/>',
    };

    function shapeSvg(name, px, weight) {
      var body = SHAPES[name] || SHAPES.message;
      return '<svg width="' + px + '" height="' + px + '" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="' + (weight || 2) + '" stroke-linecap="round" stroke-linejoin="round">' +
        body + "</svg>";
    }

    var ICON_CHAT =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
    var ICON_CLOSE =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

    /**
     * The orb.
     *
     * A sphere lit from the top left, with a slow swirl and a drifting blob
     * underneath so it reads as alive rather than as a spinner. Everything is
     * derived from the seller's accent colour — they pick one colour and the
     * rest follows.
     */
    function orbHtml(px) {
      var light = shade(config.accent, 0.42);
      var deep = shade(config.accent, -0.42);
      var glyphPx = Math.round(px * 0.38);
      var glyph = config.avatarShape
        ? shapeSvg(config.avatarShape, glyphPx, 1.6)
        : config.avatar
          ? '<span style="font-size:' + glyphPx + 'px;line-height:1">' + config.avatar + "</span>"
          : "";

      return (
        '<span class="sg-orbwrap" style="width:' + px + "px;height:" + px + 'px">' +
        (config.orbGlow === false ? "" :
          '<span class="sg-halo" style="background:radial-gradient(circle,' +
          rgba(config.accent, 0.85) + ' 0%,' + rgba(config.accent, 0) + ' 70%)"></span>') +
        '<span class="sg-ball" style="width:' + px + "px;height:" + px + "px;" +
          "background:radial-gradient(circle at 32% 26%," + light + " 0%," + config.accent + " 46%," + deep + " 100%);" +
          "box-shadow:0 8px 28px " + rgba(config.accent, 0.4) + ",0 2px 8px rgba(0,0,0,.35)\">" +
          '<span class="sg-swirl" style="background:conic-gradient(from 0deg,' +
            rgba(config.accent, 0) + "," + accent2 + "," + rgba(config.accent, 0) + "," +
            light + "," + rgba(config.accent, 0) + ')"></span>' +
              '<span class="sg-gloss" style="background:radial-gradient(circle at 32% 22%,rgba(255,255,255,.85) 0%,rgba(255,255,255,.22) 24%,transparent 50%),' +
            "radial-gradient(circle at 50% 118%,rgba(255,255,255,.28) 0%,transparent 42%)\"></span>" +
          '<span class="sg-rim"></span>' +
          (glyph ? '<span class="sg-glyph" style="color:rgba(255,255,255,.95);filter:drop-shadow(0 1px 2px ' +
            rgba(config.accent, 0.55) + ')">' + glyph + "</span>" : "") +
        "</span></span>"
      );
    }

    function paintLauncher() {
      if (!orbMode) {
        if (open) { launcher.innerHTML = ICON_CLOSE; return; }
        // Proportional to the button: enough presence to read at a glance,
        // with the circle still visible around it.
        var glyph = Math.round(size * 0.52);
        var avatar = config.avatarShape
          ? shapeSvg(config.avatarShape, glyph)
          : config.avatar
            ? '<span style="font-size:22px;line-height:1">' + config.avatar + "</span>"
            : ICON_CHAT;
        launcher.innerHTML = avatar + (hasLabel
          ? '<span style="white-space:nowrap">' + config.launcherLabel + "</span>" : "");
        return;
      }

      if (open) {
        // Closing is a plain control, not a mood: the orb would keep drawing
        // the eye to a window the visitor is already looking at.
        launcher.className = "sg-orb";
        launcher.innerHTML =
          '<span class="sg-orbwrap" style="width:' + orbSize + "px;height:" + orbSize + 'px">' +
          '<span class="sg-ball" style="display:grid;place-items:center;background:' +
          shade(config.accent, -0.25) + ";color:" + inkOn(shade(config.accent, -0.25)) +
          ';box-shadow:0 6px 20px rgba(0,0,0,.35)">' + ICON_CLOSE + "</span></span>";
        return;
      }

      if (hasLabel) {
        launcher.className = "sg-orb sg-pill";
        launcher.style.background = "rgba(20,20,24,.72)";
        launcher.style.boxShadow = "0 8px 30px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.1)";
        launcher.style.color = "#fff";
        launcher.innerHTML =
          orbHtml(Math.round(orbSize * 0.72)) +
          '<span style="white-space:nowrap;position:relative;z-index:2">' + config.launcherLabel + "</span>";
        return;
      }

      launcher.className = "sg-orb";
      launcher.style.background = "transparent";
      launcher.style.boxShadow = "none";
      launcher.innerHTML = orbHtml(orbSize);
    }

    if (!orbMode) {
      launcher.onmouseenter = function () { launcher.style.transform = "scale(1.06)"; };
      launcher.onmouseleave = function () { launcher.style.transform = "scale(1)"; };
    }

    var frame = document.createElement("iframe");
    frame.src = origin + "/c/" + encodeURIComponent(key);
    frame.title = config.title || "Chat";
    frame.style.cssText = [
      "position:fixed", "border:none", "z-index:2147483645", "display:none",
      "background:transparent", "overflow:hidden",
      "box-shadow:0 24px 70px rgba(0,0,0,.45)", "border-radius:" + radius + "px",
      "opacity:0", "transform:translateY(12px) scale(.97)",
      "transform-origin:" + (side === "right" ? "bottom right" : "bottom left"),
      "transition:opacity .22s ease,transform .26s cubic-bezier(.2,.9,.3,1.15)",
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

    function setOpen(next, byVisitor) {
      open = next;
      if (open) {
        frame.style.display = "block";
        // One frame of layout before the transition, or it starts from its
        // end state and nothing appears to move.
        requestAnimationFrame(function () {
          frame.style.opacity = "1";
          frame.style.transform = "none";
        });
      } else {
        frame.style.opacity = "0";
        frame.style.transform = "translateY(12px) scale(.97)";
        setTimeout(function () { if (!open) frame.style.display = "none"; }, 220);
      }
      paintLauncher();
      if (bubble && open) { bubble.remove(); dismissedGreeting = true; }
      if (open && byVisitor !== false) {
        try {
          window.localStorage.setItem("signalo:" + key + ":opened:v2", "1");
        } catch (e) { /* private mode */ }
      }
    }

    launcher.addEventListener("click", function () { setOpen(!open); });
    window.addEventListener("resize", layout);

    function mount() {
      document.body.appendChild(frame);
      document.body.appendChild(launcher);
      paintLauncher();
      layout();

      var seen = false;
      try { seen = window.localStorage.getItem("signalo:" + key + ":opened:v2") === "1"; } catch (e) {}

      if (bubble && !seen) {
        setTimeout(function () {
          if (!open && !dismissedGreeting) document.body.appendChild(bubble);
        }, 2500);
      }
      if (config.autoOpen && !seen) {
        setTimeout(function () { if (!open) setOpen(true, false); },
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
  fetch(origin + "/api/widget/" + encodeURIComponent(key) + "?t=" + Date.now(), {
    cache: "no-store",
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
