const ALLOWED_ORIGINS = [
  "https://tiiviskoti.fi",
  "https://www.tiiviskoti.fi",
  "https://admin.tiiviskoti.fi",
  "https://tiiviskoti-admin.vercel.app",
  "https://tiiviskoti.vercel.app",
  "http://localhost:3000",
  "http://localhost:5174",
];

/** Check if origin is a local dev address (localhost, 127.0.0.1, or private network IP). */
function isLocalDev(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}

/** Dynamic CORS headers — echoes the request origin if allowed, else defaults to primary domain. */
export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin") || "";
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    (origin.startsWith("https://") && origin.endsWith(".vercel.app")) ||
    isLocalDev(origin);

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

/** Safe default for static imports (cron jobs, background functions). */
export const corsHeaders = getCorsHeaders();
