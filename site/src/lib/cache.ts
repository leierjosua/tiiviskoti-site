/**
 * Simple in-memory TTL cache. No external dependencies.
 *
 * - Entries expire after `ttlMs` (default 30s)
 * - Max entries capped to prevent memory leaks
 * - Stale entries cleaned up lazily on get/set
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  lastAccessed: number;
}

const MAX_ENTRIES = 500;

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  entry.lastAccessed = Date.now();
  return entry.data as T;
}

export function cacheSet<T>(key: string, data: T, ttlMs = 30_000): void {
  // Evict least-recently-used entry if at capacity
  if (store.size >= MAX_ENTRIES) {
    let lruKey: string | undefined;
    let lruTime = Infinity;
    for (const [k, v] of store) {
      if (v.lastAccessed < lruTime) {
        lruTime = v.lastAccessed;
        lruKey = k;
      }
    }
    if (lruKey) store.delete(lruKey);
  }
  const now = Date.now();
  store.set(key, { data, expiresAt: now + ttlMs, lastAccessed: now });
}
