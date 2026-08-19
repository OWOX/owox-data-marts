import { beforeAll, describe, expect, it } from '@jest/globals';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { MicrosoftEntraAccessTokenVerifier } from './microsoft-entra-access-token-verifier.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OBJECT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AUDIENCE = 'api://owox-extension';
const REQUIRED_SCOPE = 'identity.exchange';

describe('MicrosoftEntraAccessTokenVerifier', () => {
  let privateKey: CryptoKey;
  let verifier: MicrosoftEntraAccessTokenVerifier;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    const publicJwk = (await exportJWK(pair.publicKey)) as JWK;
    publicJwk.kid = 'test-key';
    verifier = new MicrosoftEntraAccessTokenVerifier(
      {
        allowedAudiences: [AUDIENCE],
        requiredScope: REQUIRED_SCOPE,
        jwksUrl: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
        issuerAuthority: 'https://login.microsoftonline.com',
        clockTolerance: '5s',
      },
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
      jti: 'assertion-1',
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

  it('accepts a valid token from an arbitrary tenant and returns a durable identity', async () => {
    const result = await verifier.verify(await sign());

    expect(result).toMatchObject({
      oid: OBJECT_ID,
      tid: TENANT_ID,
      accountId: `${OBJECT_ID}:${TENANT_ID}`,
      verifiedEmail: 'user@example.com',
    });
    expect(result.replayKey).toMatch(/^sha256:[a-f0-9]{64}$/);
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

  it('does not treat email or preferred_username as verified without xms_edov=true', async () => {
    const result = await verifier.verify(
      await sign({ xms_edov: false, preferred_username: 'user@example.com' })
    );

    expect(result.verifiedEmail).toBeUndefined();
  });
});
