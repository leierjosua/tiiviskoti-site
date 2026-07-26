import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "./cors.ts";

/**
 * Verify that the caller is an authenticated user.
 * Returns the user object or a 401 Response.
 */
export async function requireAuth(
  req: Request,
): Promise<
  | { user: { id: string; email?: string }; error?: never }
  | { user?: never; error: Response }
> {
  const cors = getCorsHeaders(req);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return {
      error: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      }),
    };
  }

  // Check if this is a service_role call (from other edge functions / cron)
  // Supabase migrated to short keys (sb_secret_...) but callers may still send the old JWT.
  // Accept both: direct match OR JWT with role=service_role for this project.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (token === serviceRoleKey) {
    return { user: { id: "service_role", email: "service_role" } };
  }
  // Check old-format JWT: decode payload and verify role + ref
  if (token.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const projectRef = (Deno.env.get("SUPABASE_URL") || "").match(/\/\/([^.]+)/)?.[1];
      if (payload.role === "service_role" && payload.ref === projectRef) {
        return { user: { id: "service_role", email: "service_role" } };
      }
    } catch { /* not a valid JWT, continue to user auth */ }
  }

  // Verify user JWT via Supabase Auth
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      }),
    };
  }

  return { user: { id: user.id, email: user.email } };
}

/**
 * Verify that the caller is using the service_role key.
 * Use this for functions that should only be called by cron jobs or other edge functions.
 */
export function requireServiceRole(req: Request): Response | null {
  const cors = getCorsHeaders(req);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = authHeader.replace(/^Bearer\s+/i, "");

  // Direct match (new sb_secret_ format)
  if (token === serviceRoleKey) return null;

  // Old JWT format: decode and verify role + project ref
  if (token.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const projectRef = (Deno.env.get("SUPABASE_URL") || "").match(/\/\/([^.]+)/)?.[1];
      if (payload.role === "service_role" && payload.ref === projectRef) return null;
    } catch { /* not a valid JWT */ }
  }

  return new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403, headers: { ...cors, "Content-Type": "application/json" },
  });
}
