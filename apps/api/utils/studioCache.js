// Phase 5: in-memory 60s cache for /studio/overview and
// /studio/analytics, keyed per channel (`<channelId>:overview`,
// `<channelId>:analytics:<range>`). No new dependency — a Map with an
// expiry, as the plan specifies. Mutations a creator makes themselves
// (upload / edit / delete video, channel settings) invalidate their
// channel's entries at once; views / likes / completions from other
// users are reflected within 60s at most.
const CACHE_TTL_MS = 60_000;

/** @type {Map<string, { expiresAt: number, value: unknown }>} */
const cache = new Map();

export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

export function setCached(key, value) {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
}

export function invalidateChannelCache(channelId) {
  const prefix = `${channelId}:`;
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Test hook — the TTL itself is not shortened for tests. */
export function clearStudioCache() {
  cache.clear();
}
