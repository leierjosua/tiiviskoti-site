import { NextResponse } from "next/server";

/**
 * Creates a JSON error response with a safe message.
 * Never leaks internal details to the client.
 */
export function apiError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Catches any error, logs full details server-side,
 * and returns a safe 500 response to the client.
 */
export function handleApiError(error: unknown): NextResponse {
  console.error("API error:", error);
  return apiError("Internal server error", 500);
}

/**
 * Asserts that a Supabase query result contains data and no error.
 * Throws with Supabase error details (for server-side logging) if the query failed.
 */
export function assertSupabaseResult<T>(
  result: { data: T; error: { message: string } | null },
  errorMessage = "Supabase query failed"
): NonNullable<T> {
  if (result.error) {
    throw new Error(`${errorMessage}: ${result.error.message}`);
  }
  if (result.data == null) {
    throw new Error(`${errorMessage}: query returned null data`);
  }
  return result.data as NonNullable<T>;
}
