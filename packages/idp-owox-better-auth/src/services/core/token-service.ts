import { Payload } from '@owox/idp-protocol';
import { decodeProtectedHeader } from 'jose';
import ms from 'ms';
import { IdentityOwoxClient } from '../../client/index.js';
import { JWKSet, makeJwksCache } from '../../jwt/jwksCache.js';
import { verify } from '../../jwt/verifyJwt.js';
import { toPayload } from '../../mappers/client-payload-mapper.js';
import { formatError } from '../../utils/string-utils.js';

export interface TokenServiceConfig {
  algorithm: string;
  clockTolerance: ms.StringValue | number;
  issuer: string;
  jwtKeyCacheTtl: ms.StringValue;
}

/**
 * Validates and parses JWT access tokens using JWKS cache.
 */
export class TokenService {
  private readonly jwksCache;

  constructor(
    private readonly client: IdentityOwoxClient,
    private readonly config: TokenServiceConfig
  ) {
    this.jwksCache = makeJwksCache(this.fetchJwks.bind(this), 'OWOX_JWKS');
  }

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

  async verify(token: string): Promise<Payload | null> {
    return this.parse(token);
  }

  formatError(error: unknown): string {
    return formatError(error);
  }

  private async fetchJwks(): Promise<JWKSet> {
    const resp = await this.client.getJwks();
    return { keys: resp.keys };
  }

  private async verifyJwt(token: string) {
    const { alg } = decodeProtectedHeader(token);
    if (alg && alg !== this.config.algorithm) {
      throw new Error(`Unsupported JWT alg: ${alg}`);
    }

    const clockToleranceSeconds =
      typeof this.config.clockTolerance === 'string'
        ? ms(this.config.clockTolerance) / 1000
        : this.config.clockTolerance;

    return verify(
      token,
      async () => (await this.jwksCache.get(ms(this.config.jwtKeyCacheTtl))).keyResolver,
      async () => (await this.jwksCache.refresh(ms(this.config.jwtKeyCacheTtl))).keyResolver,
      {
        algorithm: this.config.algorithm,
        clockTolerance: clockToleranceSeconds,
        issuer: this.config.issuer,
      }
    );
  }
}
