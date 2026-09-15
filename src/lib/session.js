import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user plus a client already acting as them.
 *
 * Every server action starts here, so authorisation is resolved in exactly
 * one place and services never have to guess who is calling.
 */
export async function scoped() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Uniform shape for action results, so callers branch on one thing. */
export const ok = (data) => ({ success: true, data });
export const fail = (message) => ({ success: false, message });
export const UNAUTHORIZED = fail("Unauthorized");

/**
 * Wrap a service call in the action contract: resolve the session, run the
 * body, and turn thrown errors into a readable failure instead of a 500.
 */
export async function action(run) {
  const { supabase, user } = await scoped();
  if (!user) return UNAUTHORIZED;
  try {
    return ok(await run(supabase, user));
  } catch (err) {
    return fail(err?.message || "Something went wrong");
  }
}

/** Same, but for reads: a failure returns the fallback rather than an object. */
export async function query(run, fallback = null) {
  const { supabase, user } = await scoped();
  if (!user) return fallback;
  return run(supabase, user);
}
