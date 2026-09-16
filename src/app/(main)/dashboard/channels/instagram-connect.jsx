"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/page";
import { showError, showSuccess } from "@/lib/toast";
import { connectInstagramEmbedded } from "@/actions/channels";
import { LoaderIcon } from "lucide-react";
import { InstagramIcon } from "@/components/ui/brand-icons";

const SDK = "https://connect.facebook.net/en_US/sdk.js";

/** Load Meta's SDK once, and only for people who will actually use it. */
function loadSdk(appId) {
  if (window.FB) return Promise.resolve(window.FB);
  return new Promise((resolve, reject) => {
    if (!document.getElementById("facebook-jssdk")) {
      const el = document.createElement("script");
      el.id = "facebook-jssdk";
      el.src = SDK;
      el.async = true;
      el.onerror = () => reject(new Error("Could not reach Facebook."));
      document.body.appendChild(el);
    }
    window.fbAsyncInit = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" });
      resolve(window.FB);
    };
    // The SDK may already have run fbAsyncInit before we set it.
    const poll = setInterval(() => {
      if (window.FB) { clearInterval(poll); resolve(window.FB); }
    }, 200);
    setTimeout(() => {
      clearInterval(poll);
      if (!window.FB) reject(new Error("Facebook SDK did not load."));
    }, 15000);
  });
}

/**
 * One button instead of four pasted fields.
 *
 * Unlike WhatsApp's flow there is nothing to collect over postMessage — the
 * login code alone is enough, because the server can list the seller's Pages
 * and find the Instagram account behind them.
 */
export default function InstagramConnect({ channel, signup, p, onDone }) {
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState(null);
  const [code, setCode] = useState(null);

  async function finish(loginCode, pageId) {
    const result = await connectInstagramEmbedded(channel.id, { code: loginCode, pageId });
    if (result?.success === false) return showError(result.message);

    showSuccess(result.message);
    // Several eligible Pages: connect the first, then let them switch without
    // a second sign-in.
    setChoices(result.choices || null);
    setCode(result.choices ? loginCode : null);
    onDone?.();
  }

  async function connect() {
    setBusy(true);
    try {
      const FB = await loadSdk(signup.appId);
      const loginCode = await new Promise((resolve, reject) => {
        FB.login(
          (res) => {
            const value = res?.authResponse?.code;
            if (value) resolve(value);
            else reject(new Error(p.instagramSignup.cancelled));
          },
          {
            config_id: signup.configId,
            response_type: "code",
            override_default_response_type: true,
          },
        );
      });
      await finish(loginCode);
    } catch (err) {
      showError(err?.message || p.instagramSignup.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button type="button" onClick={connect} disabled={busy}>
        {busy ? <LoaderIcon className="size-4 animate-spin" /> : <InstagramIcon className="size-4" />}
        {channel.has_token ? p.instagramSignup.reconnect : p.instagramSignup.connect}
      </Button>

      {choices?.length > 1 && (
        <div className="mt-3">
          <p className="text-[12px] text-secondary mb-1.5">{p.instagramSignup.pickAccount}</p>
          <div className="flex flex-wrap gap-1.5">
            {choices.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => finish(code, c.id)}
                className="px-2.5 py-1.5 rounded-button text-[12px] bg-secondary-transparent2 text-secondary hover:text-fg transition-colors cursor-pointer"
              >
                {c.username ? `@${c.username}` : c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <Hint className="mt-2">{p.instagramSignup.help}</Hint>
    </div>
  );
}
