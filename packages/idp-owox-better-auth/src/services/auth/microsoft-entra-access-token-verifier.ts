import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import ms from 'ms';
import { z } from 'zod';
import type { ExtensionAuthConfig } from '../../config/idp-owox-config.js';
import { AuthenticationException, IdpFailedException } from '../../core/exceptions.js';

const EntraBooleanClaimSchema = z.preprocess(value => {
  if (value === '1') return true;
  if (value === '0') return false;
  return value;
}, z.boolean());

const EntraAccessTokenClaimsSchema = z.object({
  iss: z.string().min(1),
  aud: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  exp: z.number().int().positive(),
  nbf: z.number().int().optional(),
  iat: z.number().int().positive(),
  oid: z.string().uuid(),
  tid: z.string().uuid(),
  scp: z.string().min(1),
  email: z.string().optional(),
  xms_edov: EntraBooleanClaimSchema.optional(),
  name: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
});

export interface VerifiedMicrosoftIdentity {
  oid: string;
  tid: string;
  verifiedEmail?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
}

export type MicrosoftEntraAccessTokenVerifierConfig = ExtensionAuthConfig['microsoft'] & {
  clockTolerance: ms.StringValue | number;
};

function normalizeEmail(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = z.string().trim().toLowerCase().email().safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function isMicrosoftJwksFailure(cause: unknown): boolean {
  if (cause instanceof TypeError) return true;
  if (cause instanceof errors.JWKSTimeout) return true;
  if (cause instanceof errors.JWKSInvalid) return true;
  if (cause instanceof errors.JWKInvalid) return true;
  return cause instanceof errors.JOSEError && cause.code === errors.JOSEError.code;
}

/**
 * Verifies an Entra access token minted for the configured OWOX delegated API.
 * It deliberately ignores `preferred_username`; only `email` accompanied by
 * the boolean `xms_edov=true` claim can participate in account linking.
 */
export class MicrosoftEntraAccessTokenVerifier {
  private readonly keyResolver: JWTVerifyGetKey;

  constructor(
    private readonly config: MicrosoftEntraAccessTokenVerifierConfig,
    keyResolver?: JWTVerifyGetKey
  ) {
    this.keyResolver = keyResolver ?? createRemoteJWKSet(new URL(config.jwksUrl));
  }

  async verify(assertion: string): Promise<VerifiedMicrosoftIdentity> {
    try {
      const clockToleranceSeconds =
        typeof this.config.clockTolerance === 'string'
          ? ms(this.config.clockTolerance) / 1000
          : this.config.clockTolerance;
      const { payload } = await jwtVerify(assertion, this.keyResolver, {
        algorithms: ['RS256'],
        audience: this.config.allowedAudiences,
        clockTolerance: clockToleranceSeconds,
        requiredClaims: ['iss', 'aud', 'exp', 'iat', 'oid', 'tid', 'scp'],
      });
      const claims = EntraAccessTokenClaimsSchema.parse(payload);
      const expectedIssuer = `${this.config.issuerAuthority}/${claims.tid}/v2.0`;
      if (claims.iss !== expectedIssuer) {
        throw new Error('Entra issuer does not match token tenant');
      }

      const scopes = new Set(claims.scp.split(/\s+/).filter(Boolean));
      if (!scopes.has(this.config.requiredScope)) {
        throw new Error('Required delegated scope is missing');
      }

      const nowSeconds = Math.floor(Date.now() / 1000);
      if (claims.iat > nowSeconds + clockToleranceSeconds || claims.iat > claims.exp) {
        throw new Error('Invalid issued-at timestamp');
      }

      const verifiedEmail = claims.xms_edov === true ? normalizeEmail(claims.email) : undefined;
      const firstName = normalizeText(claims.given_name);
      const lastName = normalizeText(claims.family_name);
      const fullName = normalizeText(claims.name);

      return {
        oid: claims.oid,
        tid: claims.tid,
        ...(verifiedEmail ? { verifiedEmail } : {}),
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(fullName ? { fullName } : {}),
      };
    } catch (cause) {
      if (isMicrosoftJwksFailure(cause)) {
        throw new IdpFailedException('Microsoft signing keys are unavailable', {
          cause,
          context: { reason: 'microsoft_jwks_unavailable' },
        });
      }
      throw new AuthenticationException('Microsoft assertion validation failed', {
        cause,
        description: 'invalid_assertion',
        context: { reason: 'invalid_microsoft_assertion' },
      });
    }
  }
}
