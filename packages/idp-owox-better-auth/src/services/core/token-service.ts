import { Payload } from '@owox/idp-protocol';
import { createLocalJWKSet, decodeProtectedHeader, JWK, jwtVerify } from 'jose';
import { JWKSNoMatchingKey, JWSSignatureVerificationFailed } from 'jose/errors';
import type { JWTVerifyOptions } from 'jose/jwt/verify';
import ms from 'ms';
import { IdentityOwoxClient } from '../../client/index.js';
import { toPayload } from '../../mappers/client-payload-mapper.js';
import { formatError } from '../../utils/string-utils.js';

export interface TokenServiceConfig {
  algorithm: string;
  clockTolerance: ms.StringValue | number;
  issuer: string;
  jwtKeyCacheTtl: ms.StringValue;
}

interface JwksCacheEntry {
  keys: JWK[];
  keyResolver: ReturnType<typeof createLocalJWKSet>;
  exp: number;
  inflight?: Promise<JwksCacheEntry>;
}

/**
 * Validates and parses JWT access tokens using an inline JWKS cache.
 */
export class TokenService {
  private cacheEntry: JwksCacheEntry | null = null;

  constructor(
    private readonly client: IdentityOwoxClient,
    private readonly config: TokenServiceConfig
  ) {}

  normalizeToken(authorization: string): string {
    return authorization.replace(/^Bearer\s+/i, '').trim();
  }

  async parse(token: string): Promise<Payload | null> {
    try {
      const normalized = this.normalizeToken(token);
      const { payload } = await this.verifyJwt(normalized);
      return toPayload(payload);
    } catch {
      return null;
    }
  }

  formatError(error: unknown): string {
    return formatError(error);
  }

  // ── JWKS cache ──────────────────────────────────────────────

  private async fetchJwks(): Promise<{ keys: JWK[] }> {
    const resp = await this.client.getJwks();
    return { keys: resp.keys };
  }

  private async loadKeys(ttlMs: number): Promise<JwksCacheEntry> {
    if (this.cacheEntry?.inflight) return this.cacheEntry.inflight;

    const inflight = (async (): Promise<JwksCacheEntry> => {
      const jwks = await this.fetchJwks();
      const entry: JwksCacheEntry = {
        keys: jwks.keys,
        keyResolver: createLocalJWKSet(jwks),
        exp: Date.now() + ttlMs,
      };
      this.cacheEntry = entry;
      return entry;
    })();

    this.cacheEntry = { ...(this.cacheEntry ?? ({} as JwksCacheEntry)), inflight };
    try {
      return await inflight;
    } finally {
      if (this.cacheEntry) {
        this.cacheEntry.inflight = undefined;
      }
    }
  }

  private async getKeyResolver(ttlMs: number): Promise<ReturnType<typeof createLocalJWKSet>> {
    if (this.cacheEntry && this.cacheEntry.exp > Date.now()) {
      return this.cacheEntry.keyResolver;
    }
    return (await this.loadKeys(ttlMs)).keyResolver;
  }

  private async refreshKeyResolver(ttlMs: number): Promise<ReturnType<typeof createLocalJWKSet>> {
    return (await this.loadKeys(ttlMs)).keyResolver;
  }

  // ── JWT verification ────────────────────────────────────────

  private async verifyJwt(token: string) {
    const { alg } = decodeProtectedHeader(token);
    if (alg && alg !== this.config.algorithm) {
      throw new Error(`Unsupported JWT alg: ${alg}`);
    }

    const clockToleranceSeconds =
      typeof this.config.clockTolerance === 'string'
        ? ms(this.config.clockTolerance) / 1000
        : this.config.clockTolerance;

    const ttlMs = ms(this.config.jwtKeyCacheTtl);
    const jwtVerifyOptions: JWTVerifyOptions = {
      algorithms: [this.config.algorithm],
      clockTolerance: clockToleranceSeconds,
      issuer: this.config.issuer,
    };

    try {
      const key = await this.getKeyResolver(ttlMs);
      return await jwtVerify(token, key, jwtVerifyOptions);
    } catch (err) {
      const shouldRefresh =
        err instanceof JWKSNoMatchingKey || err instanceof JWSSignatureVerificationFailed;
      if (!shouldRefresh) throw err;

      const refreshedKey = await this.refreshKeyResolver(ttlMs);
      return await jwtVerify(token, refreshedKey, jwtVerifyOptions);
    }
  }
}
