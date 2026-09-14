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
    const token = secrets?.bot_token || "";
    return {
      ...channel,
      has_token: Boolean(token),
      has_webhook: Boolean(secrets?.webhook_secret),
      // Enough to recognise which bot this is without handing the secret to
      // the browser. A Telegram token is "<bot id>:<secret>"; the id half is
      // public anyway, the rest stays hidden.
      token_hint: token ? `${token.split(":")[0]}:••••••${token.slice(-4)}` : null,
    };
  });
}

export async function createChannel({ type, name, persona_id }) {
  const { supabase, user } = await scoped();
  if (!user) return { success: false, message: "Unauthorized" };
  if (!["web", "telegram"].includes(type)) {
    return { success: false, message: "Unsupported channel type" };
  }

  // Number repeats so several channels of a type stay tellable apart.
  let finalName = name?.trim();
  if (!finalName) {
    const base = type === "web" ? "Website widget" : "Telegram bot";
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

  // bot_token arrives from the form but lives in the write-only secrets column.
  if (updates.bot_token !== undefined) {
    const { data: current } = await supabase
      .from("channels")
      .select("secrets")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    patch.secrets = {
      ...(current?.secrets || {}),
      bot_token: updates.bot_token || null,
    };
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
