"use server";

import { createClient } from "@/lib/supabase/server";
import {
  embeddedSignupReady, exchangeCode, subscribeWaba, registerNumber, numberDetails, newPin,
} from "@/lib/channels/meta";
import { accountDetails } from "@/lib/channels/instagram";

async function scoped() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function newPublicKey() {
  return `sg_live_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

/**
 * Channels are returned without their `secrets` column — that holds bot
 * tokens, and this data reaches client components.
 */
const SAFE_COLUMNS = "id, user_id, persona_id, type, name, public_key, config, is_active, created_at, updated_at";

/** Secret keys a client may write, per channel type. Nothing else is accepted. */
const SECRET_FIELDS = {
  telegram: ["bot_token"],
  whatsapp: ["access_token", "phone_number_id", "app_secret"],
  instagram: ["access_token", "ig_id", "app_secret"],
  email: ["api_key"],
  web: [],
};

const CHANNEL_TYPES = ["web", "telegram", "whatsapp", "email", "instagram"];

export async function getChannels() {
  const { supabase, user } = await scoped();
  if (!user) return [];

  // One query. This used to be two — a second fetch just for the token flag,
  // whose error was never checked. When that call failed transiently every
  // channel came back as "no token", then reappeared on the next refetch.
  // `secrets` is read here but stripped below, so it never leaves the server.
  const { data, error } = await supabase
    .from("channels")
    .select(`${SAFE_COLUMNS}, secrets, personas(name, icon)`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data || []).map(({ secrets, ...channel }) => {
    const s = secrets || {};

    // "Has a credential" differs per channel, but the card only needs one flag.
    const token =
      channel.type === "whatsapp" || channel.type === "instagram" ? s.access_token || ""
      : channel.type === "email" ? s.api_key || ""
      : s.bot_token || "";

    // Enough to recognise which account this is without handing the secret to
    // the browser. A Telegram token is "<bot id>:<secret>"; the id half is
    // public anyway, the rest stays hidden.
    const hint =
      !token ? null
      : channel.type === "telegram" ? `${token.split(":")[0]}:••••••${token.slice(-4)}`
      : `••••••${token.slice(-4)}`;

    return {
      ...channel,
      has_token: Boolean(token),
      has_webhook:
        channel.type === "whatsapp" || channel.type === "instagram" ? Boolean(s.verify_token)
        : channel.type === "email" ? Boolean(s.inbound_secret)
        : Boolean(s.webhook_secret),
      token_hint: hint,
      // WhatsApp needs both halves before it can send at all.
      wa_phone_id: channel.type === "whatsapp" ? s.phone_number_id || null : undefined,
      has_app_secret: channel.type === "whatsapp" ? Boolean(s.app_secret) : undefined,
      // Instagram needs the account id before it can send at all.
      ig_id: channel.type === "instagram" ? s.ig_id || null : undefined,
      has_app_secret_ig: channel.type === "instagram" ? Boolean(s.app_secret) : undefined,
      // Shown so it can be pasted into the provider's console.
      verify_token:
        channel.type === "whatsapp" || channel.type === "instagram"
          ? s.verify_token || null
          : undefined,
      inbound_secret: channel.type === "email" ? s.inbound_secret || null : undefined,
    };
  });
}

export async function createChannel({ type, name, persona_id }) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };
  if (!CHANNEL_TYPES.includes(type)) {
    return { success: false, message: "Unsupported channel type" };
  }

  // Number repeats so several channels of a type stay tellable apart.
  let finalName = name?.trim();
  if (!finalName) {
    const base = {
      web: "Website widget",
      telegram: "Telegram bot",
      whatsapp: "WhatsApp",
      email: "Email inbox",
      instagram: "Instagram",
    }[type];
    const { count } = await supabase
      .from("channels")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", type);
    finalName = count ? `${base} ${count + 1}` : base;
  }

  const { data, error } = await supabase
    .from("channels")
    .insert({
      user_id: user.id,
      persona_id: persona_id || null,
      type,
      name: finalName,
      public_key: newPublicKey(),
      secrets:
        type === "whatsapp" || type === "instagram"
          ? { verify_token: crypto.randomUUID().replace(/-/g, "") }
          : type === "email"
            ? { inbound_secret: crypto.randomUUID().replace(/-/g, "") }
            : {},
    })
    .select(SAFE_COLUMNS)
    .single();

  if (error) return { success: false, message: error.message };
  return { success: true, data };
}

export async function updateChannel(id, updates) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const patch = {};
  for (const key of ["name", "persona_id", "is_active", "config"]) {
    if (updates[key] !== undefined) patch[key] = updates[key];
  }

  // Credentials arrive from the form but live in the write-only secrets column.
  const { data: current } = await supabase
    .from("channels")
    .select("type, secrets")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!current) return { success: false, message: "Channel not found" };

  const allowed = SECRET_FIELDS[current.type] || [];
  const touched = allowed.filter((key) => updates[key] !== undefined);
  if (touched.length) {
    patch.secrets = { ...(current.secrets || {}) };
    for (const key of touched) patch.secrets[key] = updates[key] || null;
  }

  const { error } = await supabase
    .from("channels")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function deleteChannel(id) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const { error } = await supabase
    .from("channels")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function rotatePublicKey(id) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const { data, error } = await supabase
    .from("channels")
    .update({ public_key: newPublicKey() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("public_key")
    .single();

  if (error) return { success: false, message: error.message };
  return { success: true, data };
}

/**
 * Point Telegram at this deployment's webhook for the channel.
 * Requires the bot token to already be saved.
 */
export async function connectTelegram(id) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const { data: channel } = await supabase
    .from("channels")
    .select("id, secrets, public_key")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!channel) return { success: false, message: "Channel not found" };

  const token = channel.secrets?.bot_token;
  if (!token) return { success: false, message: "Add the bot token first" };

  // A Telegram bot can only have one webhook. If another channel already uses
  // this token, connecting here silently steals delivery from it — which
  // looks exactly like the other channel breaking for no reason.
  const { data: siblings } = await supabase
    .from("channels")
    .select("id, name, secrets")
    .eq("user_id", user.id)
    .eq("type", "telegram")
    .neq("id", channel.id);

  const clash = (siblings || []).find((c) => c.secrets?.bot_token === token);
  if (clash) {
    return {
      success: false,
      message: `"${clash.name}" already uses this bot token. One bot can only feed one channel — delete that channel, or use a different bot.`,
    };
  }

  const base = process.env.URL?.replace(/\/$/, "");
  if (!base || base.startsWith("http://localhost")) {
    return {
      success: false,
      message:
        "Telegram needs a public HTTPS URL. Set URL in .env to your deployed domain, then connect.",
    };
  }

  const secret = crypto.randomUUID().replace(/-/g, "");
  const webhook = `${base}/api/channels/telegram/${channel.id}`;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhook,
      secret_token: secret,
      allowed_updates: ["message"],
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!body.ok) {
    return { success: false, message: body.description || "Telegram rejected the webhook" };
  }

  await supabase
    .from("channels")
    .update({ secrets: { ...(channel.secrets || {}), webhook_secret: secret } })
    .eq("id", channel.id);

  return { success: true, message: "Connected", webhook };
}

/**
 * WhatsApp is wired up in Meta's dashboard, not over an API — there is no
 * setWebhook equivalent. So instead of connecting, this proves the credentials
 * work and reports which number they belong to.
 */
export async function verifyWhatsApp(id) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const { data: channel } = await supabase
    .from("channels")
    .select("id, secrets")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!channel) return { success: false, message: "Channel not found" };

  const token = channel.secrets?.access_token;
  const phoneNumberId = channel.secrets?.phone_number_id;
  if (!token || !phoneNumberId) {
    return { success: false, message: "Add the access token and phone number id first" };
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    return { success: false, message: body?.error?.message || `Meta returned ${res.status}` };
  }

  return {
    success: true,
    message: `Connected to ${body.verified_name || ""} ${body.display_phone_number || ""}`.trim(),
  };
}

/** Confirm the Resend key is live before anyone waits on a silent failure. */
export async function verifyEmail(id) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const { data: channel } = await supabase
    .from("channels")
    .select("id, secrets, config")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!channel) return { success: false, message: "Channel not found" };
  if (!channel.config?.address) return { success: false, message: "Set the sending address first" };

  const apiKey = channel.secrets?.api_key || process.env.RESEND_API_KEY;
  if (!apiKey) return { success: false, message: "Add the Resend API key first" };

  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { success: false, message: body?.message || `Resend returned ${res.status}` };
  }

  const { data } = await res.json().catch(() => ({ data: [] }));
  const domain = String(channel.config.address).split("@")[1]?.toLowerCase();
  const known = (data || []).find((d) => d.name?.toLowerCase() === domain);

  if (!known) {
    return {
      success: false,
      message: `Resend has no verified domain for ${domain}. Add and verify it in Resend first.`,
    };
  }
  if (known.status !== "verified") {
    return { success: false, message: `${domain} is ${known.status} in Resend — finish verification first.` };
  }
  if (known.capabilities && known.capabilities.receiving !== "enabled") {
    return {
      success: false,
      message: `${domain} can send but not receive. In Resend open the domain, enable Receiving and add the MX record it gives you — until then no customer mail reaches this channel.`,
    };
  }
  if (known.capabilities && known.capabilities.sending !== "enabled") {
    return { success: false, message: `${domain} cannot send yet — enable Sending in Resend.` };
  }

  return { success: true, message: `Ready to send and receive on ${channel.config.address}` };
}


/** Whether the dashboard should offer the one-click flow at all. */
export async function whatsappSignupAvailable() {
  return { available: embeddedSignupReady(), appId: process.env.NEXT_PUBLIC_META_APP_ID || null,
           configId: process.env.NEXT_PUBLIC_META_CONFIG_ID || null };
}

/**
 * Finish Embedded Signup.
 *
 * The browser popup gives us a one-time code and the ids of the account the
 * seller picked. Everything after that happens here: swap the code for a
 * token, point Meta's webhooks at us, register the number, and save it as an
 * ordinary WhatsApp channel — the same shape the manual flow produces, so the
 * inbound route and delivery need no special case.
 */
export async function connectWhatsAppEmbedded(channelId, { code, wabaId, phoneNumberId }) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };
  if (!embeddedSignupReady()) {
    return { success: false, message: "WhatsApp sign-in is not configured on this deployment yet." };
  }
  if (!code || !wabaId || !phoneNumberId) {
    return { success: false, message: "Meta did not return a complete account — try again." };
  }

  const { data: channel } = await supabase
    .from("channels")
    .select("id, secrets")
    .eq("id", channelId)
    .eq("user_id", user.id)
    .eq("type", "whatsapp")
    .maybeSingle();

  if (!channel) return { success: false, message: "Channel not found" };

  try {
    const token = await exchangeCode(code);
    await subscribeWaba(wabaId, token);

    // A number already live somewhere else cannot be registered again, and
    // that is by far the most common reason this step fails.
    const pin = newPin();
    try {
      await registerNumber(phoneNumberId, token, pin);
    } catch (err) {
      const message = err?.message || "";
      if (!/already.*registered/i.test(message)) throw err;
    }

    let label = null;
    try {
      const details = await numberDetails(phoneNumberId, token);
      label = [details.verified_name, details.display_phone_number].filter(Boolean).join(" ");
    } catch {
      // Cosmetic only — never fail a working connection over a display name.
    }

    await supabase
      .from("channels")
      .update({
        secrets: {
          ...(channel.secrets || {}),
          access_token: token,
          phone_number_id: phoneNumberId,
          waba_id: wabaId,
          // Kept so the number can be re-registered after a two-factor reset.
          register_pin: pin,
          app_secret: process.env.META_APP_SECRET,
        },
        config: label ? { connected_number: label } : undefined,
        is_active: true,
      })
      .eq("id", channelId)
      .eq("user_id", user.id);

    return { success: true, message: label ? `Connected ${label}` : "WhatsApp connected" };
  } catch (err) {
    return { success: false, message: err?.message || "Meta refused the connection." };
  }
}

/* ─────────────────────────────── Instagram ───────────────────────────── */

/**
 * Instagram is wired up in Meta's dashboard like WhatsApp, so there is no
 * connect call — this proves the credentials work and reports whose account
 * they belong to.
 */
export async function verifyInstagram(id) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };

  const { data: channel } = await supabase
    .from("channels")
    .select("id, secrets, config")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!channel) return { success: false, message: "Channel not found" };

  const token = channel.secrets?.access_token;
  const igId = channel.secrets?.ig_id;
  if (!token || !igId) {
    return { success: false, message: "Add the access token and Instagram account id first" };
  }

  try {
    const account = await accountDetails({ token, igId, login: channel.secrets?.login });
    const label = account.username ? `@${account.username}` : account.name || igId;

    // Worth storing: the card can then name the account without a round trip.
    await supabase
      .from("channels")
      .update({ config: { ...(channel.config || {}), connected_account: label } })
      .eq("id", channel.id)
      .eq("user_id", user.id);

    return { success: true, message: `Connected to ${label}` };
  } catch (err) {
    return { success: false, message: err?.message || "Instagram refused the credentials." };
  }
}

/** Whether the dashboard should offer one-click Instagram at all. */
export async function instagramSignupAvailable() {
  return {
    available: Boolean(
      process.env.NEXT_PUBLIC_META_APP_ID &&
      process.env.META_APP_SECRET &&
      process.env.NEXT_PUBLIC_META_IG_CONFIG_ID,
    ),
    appId: process.env.NEXT_PUBLIC_META_APP_ID || null,
    configId: process.env.NEXT_PUBLIC_META_IG_CONFIG_ID || null,
  };
}

/**
 * Finish one-click Instagram.
 *
 * The popup gives a one-time code. Everything else happens here: swap it for
 * a token, find the Page whose Instagram account the seller picked, take that
 * Page's own token, subscribe it to message webhooks, and save the result in
 * the same shape the manual flow produces — so the inbound route and delivery
 * need no special case.
 */
export async function connectInstagramEmbedded(channelId, { code, pageId } = {}) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };
  if (!code) return { success: false, message: "Meta did not return a sign-in code — try again." };

  const { data: channel } = await supabase
    .from("channels")
    .select("id, secrets, config")
    .eq("id", channelId)
    .eq("user_id", user.id)
    .eq("type", "instagram")
    .maybeSingle();

  if (!channel) return { success: false, message: "Channel not found" };

  const version = process.env.META_API_VERSION || "v21.0";
  const graph = async (path, { token, method = "GET", body } = {}) => {
    const res = await fetch(`https://graph.facebook.com/${version}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || `Meta returned ${res.status}`);
    return json;
  };

  try {
    const userToken = await exchangeCode(code);

    // A seller may admin several Pages; only those with a professional
    // Instagram account attached can receive DMs.
    const { data: pages } = await graph(
      "/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}",
      { token: userToken },
    );

    const usable = (pages || []).filter((pg) => pg.instagram_business_account?.id);
    if (!usable.length) {
      return {
        success: false,
        message:
          "None of your Facebook Pages has an Instagram professional account linked. Link one in Instagram → Settings → Account type, then try again.",
      };
    }

    const page = (pageId && usable.find((pg) => pg.id === pageId)) || usable[0];
    const igId = page.instagram_business_account.id;
    const username = page.instagram_business_account.username;

    // This is what replaces pasting a callback URL by hand: the Page starts
    // delivering messages to the app's webhook from here on.
    await graph(`/${page.id}/subscribed_apps`, {
      token: page.access_token,
      method: "POST",
      body: { subscribed_fields: ["messages", "messaging_postbacks", "messaging_seen"] },
    });

    await supabase
      .from("channels")
      .update({
        secrets: {
          ...(channel.secrets || {}),
          access_token: page.access_token,
          ig_id: igId,
          page_id: page.id,
          login: "facebook",
          app_secret: process.env.META_APP_SECRET,
        },
        config: {
          ...(channel.config || {}),
          connected_account: username ? `@${username}` : page.name,
        },
        is_active: true,
      })
      .eq("id", channelId)
      .eq("user_id", user.id);

    return {
      success: true,
      message: username ? `Connected @${username}` : `Connected ${page.name}`,
      choices: usable.length > 1
        ? usable.map((pg) => ({ id: pg.id, name: pg.name, username: pg.instagram_business_account.username }))
        : null,
    };
  } catch (err) {
    return { success: false, message: err?.message || "Meta refused the connection." };
  }
}
