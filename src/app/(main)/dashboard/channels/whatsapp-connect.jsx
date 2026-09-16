"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/page";
import { showError, showSuccess } from "@/lib/toast";
import { connectWhatsAppEmbedded } from "@/actions/channels";
import { LoaderIcon } from "lucide-react";
import { WhatsAppIcon } from "@/components/ui/brand-icons";

const SDK = "https://connect.facebook.net/en_US/sdk.js";

/** Load Meta's SDK once, and only for people who will actually use it. */
function loadSdk(appId) {
  if (window.FB) return Promise.resolve(window.FB);
  return new Promise((resolve, reject) => {
    const existing = document.getElementById("facebook-jssdk");
    if (!existing) {
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
    setTimeout(() => { clearInterval(poll); if (!window.FB) reject(new Error("Facebook SDK did not load.")); }, 15000);
  });
}

/**
 * One button instead of five pasted fields.
 *
 * Meta's popup returns the chosen account over postMessage and the
 * authorisation code through the login callback — two separate channels, so
 * both are collected before anything is sent to the server.
 */
export default function WhatsAppConnect({ channel, signup, p, onDone }) {
  const [busy, setBusy] = useState(false);
  const account = useRef(null);

  useEffect(() => {
    function onMessage(event) {
      if (!String(event.origin).endsWith("facebook.com")) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
          account.current = {
            wabaId: data.data?.waba_id,
            phoneNumberId: data.data?.phone_number_id,
          };
        }
        if (data.event === "CANCEL") account.current = null;
      } catch {
        // Facebook posts plenty of unrelated chatter; ignore what we cannot read.
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function connect() {
    setBusy(true);
    account.current = null;
    try {
      const FB = await loadSdk(signup.appId);

      const code = await new Promise((resolve, reject) => {
        FB.login(
          (res) => {
            const value = res?.authResponse?.code;
            if (value) resolve(value);
            else reject(new Error(p.whatsappSignup.cancelled));
          },
          {
            config_id: signup.configId,
            response_type: "code",
            override_default_response_type: true,
            extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
          },
        );
      });

      if (!account.current?.phoneNumberId) throw new Error(p.whatsappSignup.noNumber);

      const result = await connectWhatsAppEmbedded(channel.id, { code, ...account.current });
      if (result?.success === false) showError(result.message);
      else { showSuccess(result.message); onDone?.(); }
    } catch (err) {
      showError(err?.message || p.whatsappSignup.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button type="button" onClick={connect} disabled={busy}>
        {busy ? <LoaderIcon className="size-4 animate-spin" /> : <WhatsAppIcon className="size-4" />}
        {channel.has_token ? p.whatsappSignup.reconnect : p.whatsappSignup.connect}
      </Button>
      <Hint className="mt-2">{p.whatsappSignup.help}</Hint>
    </div>
  );
}
