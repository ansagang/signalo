/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  // The dev server is reached through an ngrok tunnel while testing Telegram
  // and WhatsApp webhooks, which Next otherwise rejects as a cross-origin
  // dev request. Harmless in production — it only affects `next dev`.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.io"],
};

export default nextConfig;
