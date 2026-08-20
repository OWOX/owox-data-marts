import { beforeAll, describe, expect, it } from '@jest/globals';
import {
  createLocalJWKSet,
  errors,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type JWTVerifyGetKey,
} from 'jose';
import { MicrosoftEntraAccessTokenVerifier } from './microsoft-entra-access-token-verifier.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OBJECT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AUDIENCE = 'api://owox-extension';
const REQUIRED_SCOPE = 'identity.exchange';
const VERIFIER_CONFIG = {
  allowedAudiences: [AUDIENCE],
  requiredScope: REQUIRED_SCOPE,
  jwksUrl: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
  issuerAuthority: 'https://login.microsoftonline.com',
  clockTolerance: '5s',
} as const;

describe('MicrosoftEntraAccessTokenVerifier', () => {
  let privateKey: CryptoKey;
  let verifier: MicrosoftEntraAccessTokenVerifier;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    const publicJwk = (await exportJWK(pair.publicKey)) as JWK;
    publicJwk.kid = 'test-key';
    verifier = new MicrosoftEntraAccessTokenVerifier(
      VERIFIER_CONFIG,
      createLocalJWKSet({ keys: [publicJwk] })
    );
  });

  async function sign(overrides: Record<string, unknown> = {}): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      oid: OBJECT_ID,
      tid: TENANT_ID,
      scp: `openid ${REQUIRED_SCOPE}`,
      email: 'User@Example.com',
      xms_edov: true,
      given_name: 'User',
      family_name: 'Name',
      name: 'User Name',
      ...overrides,
    };
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(`https://login.microsoftonline.com/${TENANT_ID}/v2.0`)
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);
  }

  it('accepts a valid token from an arbitrary tenant and returns a verified identity', async () => {
    const result = await verifier.verify(await sign());

    expect(result).toMatchObject({
      oid: OBJECT_ID,
      tid: TENANT_ID,
      verifiedEmail: 'user@example.com',
      firstName: 'User',
      lastName: 'Name',
      fullName: 'User Name',
    });
  });

  it('normalizes the Entra string representation of xms_edov', async () => {
    const verified = await verifier.verify(await sign({ xms_edov: '1' }));
    const unverified = await verifier.verify(await sign({ xms_edov: '0' }));

    expect(verified.verifiedEmail).toBe('user@example.com');
    expect(unverified.verifiedEmail).toBeUndefined();
  });

  it('rejects a token issued for Microsoft Graph or another audience', async () => {
    const token = await new SignJWT({
      oid: OBJECT_ID,
      tid: TENANT_ID,
      scp: REQUIRED_SCOPE,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(`https://login.microsoftonline.com/${TENANT_ID}/v2.0`)
      .setAudience('00000003-0000-0000-c000-000000000000')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(verifier.verify(token)).rejects.toMatchObject({
      description: 'invalid_assertion',
    });
  });

  it('rejects mismatched issuer and tenant claims', async () => {
    const token = await new SignJWT({
      oid: OBJECT_ID,
      tid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      scp: REQUIRED_SCOPE,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(`https://login.microsoftonline.com/${TENANT_ID}/v2.0`)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(verifier.verify(token)).rejects.toMatchObject({
      description: 'invalid_assertion',
    });
  });

  it('requires the configured delegated API scope', async () => {
    await expect(verifier.verify(await sign({ scp: 'User.Read' }))).rejects.toMatchObject({
      description: 'invalid_assertion',
    });
  });

  it('rejects expired assertions and assertions signed by an unknown key', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({
      oid: OBJECT_ID,
      tid: TENANT_ID,
      scp: REQUIRED_SCOPE,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(`https://login.microsoftonline.com/${TENANT_ID}/v2.0`)
      .setAudience(AUDIENCE)
      .setIssuedAt(now - 3600)
      .setExpirationTime(now - 60)
      .sign(privateKey);
    const otherPair = await generateKeyPair('RS256');
    const forged = await new SignJWT({
      oid: OBJECT_ID,
      tid: TENANT_ID,
      scp: REQUIRED_SCOPE,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(`https://login.microsoftonline.com/${TENANT_ID}/v2.0`)
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(otherPair.privateKey);

    await expect(verifier.verify(expired)).rejects.toMatchObject({
      description: 'invalid_assertion',
    });
    await expect(verifier.verify(forged)).rejects.toMatchObject({
      description: 'invalid_assertion',
    });
  });

  it.each([
    ['a JWKS timeout', new errors.JWKSTimeout()],
    ['a non-success JWKS response', new errors.JOSEError('Expected 200 OK')],
    ['an invalid JWKS response', new errors.JWKSInvalid('Invalid JWKS')],
    ['a JWKS network failure', new TypeError('fetch failed')],
  ])('reports %s as an upstream failure', async (_label, failure) => {
    const keyResolver: JWTVerifyGetKey = async () => {
      throw failure;
    };
    const unavailableVerifier = new MicrosoftEntraAccessTokenVerifier(VERIFIER_CONFIG, keyResolver);

    await expect(unavailableVerifier.verify(await sign())).rejects.toMatchObject({
      name: 'IdpFailedException',
      status: 500,
      context: { reason: 'microsoft_jwks_unavailable' },
    });
  });

  it('keeps an unknown signing key classified as an invalid assertion', async () => {
    const keyResolver: JWTVerifyGetKey = async () => {
      throw new errors.JWKSNoMatchingKey();
    };
    const unknownKeyVerifier = new MicrosoftEntraAccessTokenVerifier(VERIFIER_CONFIG, keyResolver);

    await expect(unknownKeyVerifier.verify(await sign())).rejects.toMatchObject({
      name: 'AuthenticationException',
      status: 401,
      description: 'invalid_assertion',
    });
  });

  it('does not treat email or preferred_username as verified without xms_edov=true', async () => {
    const result = await verifier.verify(
      await sign({ xms_edov: false, preferred_username: 'user@example.com' })
    );

    expect(result.verifiedEmail).toBeUndefined();
  });
});
