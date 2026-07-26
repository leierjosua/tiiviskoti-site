import { createClient } from "@supabase/supabase-js";

// Generated DB types available at ./database.types.ts
// Usage: import type { Database } from "./database.types"
// Then: Database["public"]["Tables"]["bookings"]["Row"]

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/**
 * Get a fresh access token, forcing a session refresh if needed.
 * Use this instead of getSession() when sending tokens to external APIs
 * (PDF generators, edge functions) to avoid stale/expired JWTs.
 */
export async function getFreshToken(): Promise<string> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) {
    throw new Error("Not authenticated");
  }
  return data.session.access_token;
}
