import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { createPublicKey } from 'crypto';
import * as jwt from 'jsonwebtoken';

/**
 * JWT payload structure for Google Service Account tokens
 */
export interface JwtPayload {
  iss: string;
  jti?: string;
  payload: unknown;
  [key: string]: unknown;
}

/**
 * JWK (JSON Web Key) structure for RSA keys
 */
interface JwkKey {
  kid: string;
  kty: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
}

/**
 * JWK Set structure containing multiple keys
 */
interface JwkSet {
  keys: JwkKey[];
}

export const GoogleJwtBody = createParamDecorator(
  (expectedServiceAccount: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const body = request.body;

    if (!body || typeof body !== 'string') {
      throw new BadRequestException('Request body must contain JWT token');
    }

    if (!expectedServiceAccount) {
      throw new BadRequestException('Expected service account email must be provided');
    }

    return validateJwt(body, expectedServiceAccount);
  }
);

/**
 * Cache for storing service account certificates
 */
const certsCache = new Map<string, { [kid: string]: string }>();
const cacheExpiry = new Map<string, number>();
const CACHE_DURATION = 3600000; // 1 hour

/**
 * Validates JWT token from Google Service Account
 */
export async function validateJwt(
  token: string,
  expectedServiceAccount: string,
  audience?: string
): Promise<unknown> {
  const claims = await verifyJwtClaims(token, expectedServiceAccount, audience);
  return claims.payload;
}

/**
 * Same verification as {@link validateJwt}, but returns the full set of verified
 * claims instead of only the nested `payload` object.
 */
export async function verifyJwtClaims(
  token: string,
  expectedServiceAccount: string,
  audience?: string
): Promise<JwtPayload> {
  try {
    await ensureCertsCache(expectedServiceAccount);

    const certs = certsCache.get(expectedServiceAccount) ?? {};
    const header = jwt.decode(token, { complete: true })?.header;
    // A Google-managed service account keeps several system-managed keys active at once and
    // IAM signBlob does not report which one it will use, so tokens we sign carry no kid.
    const candidateKeys = header?.kid ? [certs[header.kid]].filter(Boolean) : Object.values(certs);

    if (candidateKeys.length === 0) {
      throw new UnauthorizedException('No public key available to verify the JWT');
    }

    const payload = verifyWithAnyKey(token, candidateKeys, audience);

    if (payload.iss !== expectedServiceAccount) {
      throw new UnauthorizedException(
        `Invalid issuer. Expected: ${expectedServiceAccount}, got: ${payload.iss}`
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
      throw error;
    }
    throw new UnauthorizedException(`JWT validation failed: ${error.message}`);
  }
}

function verifyWithAnyKey(token: string, publicKeys: string[], audience?: string): JwtPayload {
  let lastError: unknown;
  for (const publicKey of publicKeys) {
    try {
      return jwt.verify(token, publicKey, { algorithms: ['RS256'], audience }) as JwtPayload;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Ensures certificates cache is up to date for the given service account
 */
async function ensureCertsCache(serviceAccountEmail: string): Promise<void> {
  const now = Date.now();
  const expiry = cacheExpiry.get(serviceAccountEmail) || 0;

  if (now < expiry && certsCache.has(serviceAccountEmail)) {
    return;
  }

  try {
    const jwkUrl = `https://www.googleapis.com/service_accounts/v1/jwk/${serviceAccountEmail}`;

    const response = await fetch(jwkUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch service account JWK: ${response.status}`);
    }

    const jwkSet = (await response.json()) as JwkSet;

    const certs: { [kid: string]: string } = {};
    if (jwkSet.keys && Array.isArray(jwkSet.keys)) {
      for (const key of jwkSet.keys) {
        if (key.kid && key.kty === 'RSA') {
          certs[key.kid] = jwkToPem(key);
        }
      }
    }

    certsCache.set(serviceAccountEmail, certs);
    cacheExpiry.set(serviceAccountEmail, now + CACHE_DURATION);
  } catch (error) {
    throw new Error(`Failed to update service account certificates cache: ${error.message}`);
  }
}

/**
 * Converts JWK to PEM format using Node.js built-in capabilities
 */
function jwkToPem(jwk: JwkKey): string {
  try {
    const publicKey = createPublicKey({
      key: jwk,
      format: 'jwk',
    });

    return publicKey.export({
      type: 'spki',
      format: 'pem',
    }) as string;
  } catch (error) {
    throw new Error(`Failed to convert JWK to PEM: ${error.message}`);
  }
}
