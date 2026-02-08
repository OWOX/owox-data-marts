import { decodeProtectedHeader } from 'jose';

import { JWKSet, makeJwksCache } from './jwksCache.js';
import { verify } from './verifyJwt.js';

import { Payload } from '@owox/idp-protocol';
import ms from 'ms';
import { IdentityOwoxClient } from '../client/index.js';
import { toPayload } from '../mappers/client-payload-mapper.js';

/** Configuration for JWT parsing and verification. */
export interface ParseTokenConfig {
  jwtKeyCacheTtl: ms.StringValue;
  clockTolerance: string | number;
  expectedIss: string;
  algorithm: string;
}

/**
 * Parses and verifies a JWT using JWKS from Identity OWOX.
 */
export async function parseToken(
  token: string,
  client: IdentityOwoxClient,
  config: ParseTokenConfig
): Promise<Payload> {
  const { alg } = decodeProtectedHeader(token);
  if (alg && alg !== config.algorithm) {
    throw new Error(`Unsupported JWT alg: ${alg}`);
  }

  const fetchJwks = async (): Promise<JWKSet> => {
    const resp = await client.getJwks();
    return { keys: resp.keys };
  };

  const cacheKey = 'JWKS_KEYS';
  const cache = makeJwksCache(fetchJwks, cacheKey);

  const { payload } = await verify(
    token,
    async () => (await cache.get(ms(config.jwtKeyCacheTtl))).keyResolver,
    async () => (await cache.refresh(ms(config.jwtKeyCacheTtl))).keyResolver,
    {
      algorithm: config.algorithm,
      clockTolerance: config.clockTolerance,
      issuer: config.expectedIss,
    }
  );

  return toPayload(payload);
}
