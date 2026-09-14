import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, ngrok-skip-browser-warning",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * New messages on a widget conversation since `after`.
 *
 * The widget polls this so a human taking over in the dashboard actually
 * reaches the customer — without it, an agent's reply sits in the database
 * and the visitor stares at a dead chat.
 *
 * The public key and the session id together identify one conversation;
 * neither is enough alone, and nothing else from the request is trusted.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const publicKey = url.searchParams.get("public_key");
  const sessionId = url.searchParams.get("session_id");
  const after = url.searchParams.get("after");

  if (!publicKey || !sessionId) {
    return Response.json({ success: false, message: "public_key and session_id are required." }, { status: 400, headers: CORS });
  }

  const supabase = createServiceClient();

  const { data: channel } = await supabase
    .from("channels")
    .select("id, user_id")
    .eq("public_key", publicKey)
    .maybeSingle();

  if (!channel) {
    return Response.json({ success: false, message: "Unknown channel." }, { status: 404, headers: CORS });
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, handoff, status")
    .eq("external_session_id", sessionId)
    .eq("user_id", channel.user_id)
    .maybeSingle();

  if (!conversation) {
    return Response.json({ success: true, messages: [], handoff: false }, { headers: CORS });
  }

  let query = supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversation.id)
    // The visitor's own messages are already on screen; only echo back
    // what the shop said.
    .in("role", ["assistant", "agent"])
    .order("created_at", { ascending: true })
    .limit(30);

  if (after) query = query.gt("created_at", after);

  const { data: messages, error } = await query;
  if (error) {
    return Response.json({ success: false, message: error.message }, { status: 500, headers: CORS });
  }

  return Response.json(
    { success: true, messages: messages || [], handoff: conversation.handoff },
    { headers: { ...CORS, "Cache-Control": "no-store" } },
  );
}
