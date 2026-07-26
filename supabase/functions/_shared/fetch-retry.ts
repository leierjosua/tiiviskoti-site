/**
 * Fetch with exponential backoff retry for transient failures.
 *
 * Retries on: network errors, 429 (rate limit), 500-599 (server errors).
 * Does NOT retry: 4xx client errors (except 429).
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts?: { maxRetries?: number; baseDelayMs?: number }
): Promise<Response> {
  const maxRetries = opts?.maxRetries ?? 3;
  const baseDelay = opts?.baseDelayMs ?? 1000;

  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, init);

      // Success or non-retryable client error
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        return res;
      }

      // Retryable: 429 or 5xx
      lastResponse = res;

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * delay * 0.1;
        console.warn(
          `fetchWithRetry: ${res.status} on attempt ${attempt + 1}/${maxRetries + 1}, ` +
          `retrying in ${Math.round(delay + jitter)}ms — ${url}`
        );
        await sleep(delay + jitter);
      }
    } catch (err) {
      // Network error (DNS, timeout, etc.)
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(
          `fetchWithRetry: network error on attempt ${attempt + 1}/${maxRetries + 1}, ` +
          `retrying in ${delay}ms — ${url}: ${lastError.message}`
        );
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  if (lastResponse) return lastResponse;
  throw lastError ?? new Error(`fetchWithRetry failed after ${maxRetries + 1} attempts`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
