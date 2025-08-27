import { decodeProtectedHeader } from 'jose';

import { JWKSet, makeJwksCache } from './jwksCache';
import { verify } from './verifyJwt';

import { Payload } from '@owox/idp-protocol';
import { IdentityOwoxClient } from '../client';
import { toPayload } from '../mappers/idpOwoxPayloadToPayloadMapper';
import ms from 'ms';

export interface ParseTokenConfig {
  jwtKeyCacheTtl: ms.StringValue;
  clockTolerance: string | number;
  expectedIss: string;
  algorithm: string;
}

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
