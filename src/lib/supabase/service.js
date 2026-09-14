import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client with no cookie or session coupling.
 *
 * Used by the public chat endpoints, which are unauthenticated: there is no
 * user session to read, so every query made with this client must be scoped
 * explicitly by the channel's user_id. Never hand this client a value that
 * came from the browser without resolving it through a channel row first.
 */
let _client;

export function createServiceClient() {
  if (!_client) {
    _client = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return _client;
}
