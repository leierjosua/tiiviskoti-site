import { NextRequest } from "next/server";
import { apiError } from "./api-utils";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Simple IP-based rate limiter.
 * Returns null if allowed, or a 429 NextResponse if rate limited.
 *
 * @param req - The incoming request
 * @param limit - Max requests per window (default 20)
 * @param windowMs - Time window in milliseconds (default 60_000 = 1 minute)
 */
export function rateLimit(
  req: NextRequest,
  limit = 20,
  windowMs = 60_000,
) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";

  const key = `${ip}:${req.nextUrl.pathname}`;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  entry.count++;
  if (entry.count > limit) {
    return apiError("Liian monta pyyntöä. Yritä hetken kuluttua uudelleen.", 429);
  }

  return null;
}
