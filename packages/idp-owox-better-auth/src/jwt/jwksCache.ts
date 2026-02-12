import { createLocalJWKSet, JWK } from 'jose';

/** JWKS payload structure. */
export interface JWKSet {
  keys: JWK[];
}

/** Async loader for JWKS keys. */
export interface JwksFetcher {
  (): Promise<JWKSet>;
}

interface CacheEntry {
  jwks: JWKSet;
  keyResolver: ReturnType<typeof createLocalJWKSet>;
  exp: number;
  inflight?: Promise<CacheEntry>;
}

/**
 * Creates an in-memory JWKS cache with refresh support.
 */
export function makeJwksCache(fetchJwks: JwksFetcher, key: string) {
  const cache = new Map<string, CacheEntry>();

  async function load(ttlMs: number): Promise<CacheEntry> {
    const existing = cache.get(key);
    if (existing?.inflight) return existing.inflight;

    const inflight = (async () => {
      const jwks = await fetchJwks();
      const cacheEntry: CacheEntry = {
        jwks,
        keyResolver: createLocalJWKSet(jwks),
        exp: Date.now() + ttlMs,
      };
      cache.set(key, cacheEntry);
      return cacheEntry;
    })();

    cache.set(key, { ...(existing ?? {}), inflight } as CacheEntry);
    try {
      return await inflight;
    } finally {
      const cacheEntry = cache.get(key);
      if (cacheEntry) cacheEntry.inflight = undefined;
    }
  }

  async function get(ttlMs: number): Promise<CacheEntry> {
    const cacheEntry = cache.get(key);
    if (!cacheEntry || cacheEntry.exp <= Date.now()) return load(ttlMs);
    return cacheEntry;
  }

  async function refresh(ttlMs: number) {
    return load(ttlMs);
  }

  return { get, refresh };
}
