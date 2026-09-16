/**
 * Meta Embedded Signup.
 *
 * The manual path asks a salon owner for a permanent access token, a phone
 * number ID, an app secret, and to paste a callback URL into Meta's dashboard.
 * Embedded Signup replaces all of it with one button: they log in with
 * Facebook, pick a number, and Meta hands us the credentials.
 *
 * It only works for other people's numbers once the Meta app has Business
 * Verification, Tech Provider status and App Review for the two whatsapp_*
 * permissions. Until then `embeddedSignupReady()` is false and the dashboard
 * keeps showing the manual fields.
 */

export const GRAPH = `https://graph.facebook.com/${process.env.META_API_VERSION || "v21.0"}`;

/** Configured well enough to show the button at all. */
export function embeddedSignupReady() {
  return Boolean(
    process.env.NEXT_PUBLIC_META_APP_ID &&
    process.env.META_APP_SECRET &&
    process.env.NEXT_PUBLIC_META_CONFIG_ID,
  );
}

async function graph(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${GRAPH}${path}`, {
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
}

/** The short-lived code from the popup becomes a usable access token. */
export async function exchangeCode(code) {
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    code,
  });
  const json = await graph(`/oauth/access_token?${params}`);
  if (!json.access_token) throw new Error("Meta did not return an access token.");
  return json.access_token;
}

/**
 * Point the customer's WhatsApp account at our webhook.
 *
 * This is the step that replaces pasting a callback URL and verify token by
 * hand — Meta already knows where to deliver, because the app is subscribed.
 */
export async function subscribeWaba(wabaId, token) {
  return graph(`/${wabaId}/subscribed_apps`, { token, method: "POST" });
}

/**
 * Register the number for the Cloud API.
 *
 * The PIN is two-factor for the number itself. A number already registered
 * elsewhere fails here, which is the single most common onboarding stumble.
 */
export async function registerNumber(phoneNumberId, token, pin) {
  return graph(`/${phoneNumberId}/register`, {
    token,
    method: "POST",
    body: { messaging_product: "whatsapp", pin },
  });
}

/** Whose number this is, so the dashboard can show it back to them. */
export async function numberDetails(phoneNumberId, token) {
  return graph(`/${phoneNumberId}?fields=display_phone_number,verified_name`, { token });
}

/** Six digits, so the value is never guessable from the account. */
export function newPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Verify Meta's X-Hub-Signature-256 over the raw body.
 *
 * Every Meta product signs webhooks the same way, so WhatsApp and Instagram
 * share this. Node's timingSafeEqual throws on a length mismatch, hence the
 * length guard before the comparison.
 */
export async function verifyMetaSignature({ appSecret, rawBody, header }) {
  if (!appSecret) return true; // not configured — the channel id is the only gate
  if (!header?.startsWith("sha256=")) return false;

  const { createHmac, timingSafeEqual } = await import("crypto");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const got = header.slice("sha256=".length);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got, "utf8"), Buffer.from(expected, "utf8"));
}
