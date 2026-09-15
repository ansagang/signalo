"use server";

import { createClient } from "@/lib/supabase/server";

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
  email: ["api_key"],
  web: [],
};

const CHANNEL_TYPES = ["web", "telegram", "whatsapp", "email"];

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
      channel.type === "whatsapp" ? s.access_token || ""
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
        channel.type === "whatsapp" ? Boolean(s.verify_token)
        : channel.type === "email" ? Boolean(s.inbound_secret)
        : Boolean(s.webhook_secret),
      token_hint: hint,
      // WhatsApp needs both halves before it can send at all.
      wa_phone_id: channel.type === "whatsapp" ? s.phone_number_id || null : undefined,
      has_app_secret: channel.type === "whatsapp" ? Boolean(s.app_secret) : undefined,
      // Shown so it can be pasted into the provider's console.
      verify_token: channel.type === "whatsapp" ? s.verify_token || null : undefined,
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
        type === "whatsapp"
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

  return { success: true, message: `Ready to send from ${channel.config.address}` };
}
