import { UnauthorizedException } from '@nestjs/common';
import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { JwksUnavailableError, verifyJwtClaims } from './google-jwt-body.decorator';

function keyPair(): { publicKey: Record<string, string>; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    publicKey: publicKey.export({ format: 'jwk' }) as unknown as Record<string, string>,
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
  };
}

function mockJwks(keys: { kid: string; jwk: Record<string, string> }[]) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ keys: keys.map(({ kid, jwk }) => ({ ...jwk, kid, kty: 'RSA' })) }),
  }) as unknown as typeof fetch;
}

describe('verifyJwtClaims', () => {
  // The cert cache is module-level and keyed by service account, so each test needs its own.
  let account = 0;
  const nextAccount = () => `sa-${++account}@owox-registry.iam.gserviceaccount.com`;

  function signWithIssuer(privateKey: string, iss: string, header: Record<string, unknown> = {}) {
    return jwt.sign({ iss, aud: 'https://customer.test', payload: { ok: true } }, privateKey, {
      algorithm: 'RS256',
      header: { alg: 'RS256', ...header },
    });
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('verifies a token that carries a matching kid', async () => {
    const sa = nextAccount();
    const { publicKey, privateKey } = keyPair();
    mockJwks([{ kid: 'key-a', jwk: publicKey }]);

    const claims = await verifyJwtClaims(
      signWithIssuer(privateKey, sa, { kid: 'key-a' }),
      sa,
      'https://customer.test'
    );

    expect(claims.iss).toBe(sa);
  });

  it('keeps verifying a token signed with an older key after a newer key is published', async () => {
    const sa = nextAccount();
    const older = keyPair();
    const newer = keyPair();
    mockJwks([
      { kid: 'key-a', jwk: older.publicKey },
      { kid: 'key-b', jwk: newer.publicKey },
    ]);

    const claims = await verifyJwtClaims(
      signWithIssuer(older.privateKey, sa, { kid: 'key-a' }),
      sa,
      'https://customer.test'
    );

    expect(claims.payload).toEqual({ ok: true });
  });

  it('refreshes a warm cache once when a newly rotated kid appears', async () => {
    const sa = nextAccount();
    const older = keyPair();
    const newer = keyPair();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keys: [{ ...older.publicKey, kid: 'key-a', kty: 'RSA' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          keys: [
            { ...older.publicKey, kid: 'key-a', kty: 'RSA' },
            { ...newer.publicKey, kid: 'key-b', kty: 'RSA' },
          ],
        }),
      }) as unknown as typeof fetch;

    await verifyJwtClaims(
      signWithIssuer(older.privateKey, sa, { kid: 'key-a' }),
      sa,
      'https://customer.test'
    );
    const tokens = [
      signWithIssuer(newer.privateKey, sa, { kid: 'key-b' }),
      signWithIssuer(newer.privateKey, sa, { kid: 'key-b' }),
    ];

    await expect(
      Promise.all(tokens.map(token => verifyJwtClaims(token, sa, 'https://customer.test')))
    ).resolves.toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('throttles repeated refreshes for an unpublished kid', async () => {
    const sa = nextAccount();
    const published = keyPair();
    const foreign = keyPair();
    mockJwks([{ kid: 'key-a', jwk: published.publicKey }]);

    await verifyJwtClaims(
      signWithIssuer(published.privateKey, sa, { kid: 'key-a' }),
      sa,
      'https://customer.test'
    );
    const token = signWithIssuer(foreign.privateKey, sa, { kid: 'key-x' });

    await expect(verifyJwtClaims(token, sa, 'https://customer.test')).rejects.toThrow(
      'Public key not found for kid'
    );
    await expect(verifyJwtClaims(token, sa, 'https://customer.test')).rejects.toThrow(
      'Public key not found for kid'
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects a token without a kid', async () => {
    const sa = nextAccount();
    const { publicKey, privateKey } = keyPair();
    mockJwks([{ kid: 'key-a', jwk: publicKey }]);

    await expect(
      verifyJwtClaims(signWithIssuer(privateKey, sa), sa, 'https://customer.test')
    ).rejects.toThrow('JWT header missing kid');
  });

  it('rejects a token whose kid the account does not publish', async () => {
    const sa = nextAccount();
    const published = keyPair();
    const foreign = keyPair();
    mockJwks([{ kid: 'key-a', jwk: published.publicKey }]);

    await expect(
      verifyJwtClaims(
        signWithIssuer(foreign.privateKey, sa, { kid: 'key-x' }),
        sa,
        'https://customer.test'
      )
    ).rejects.toThrow('Public key not found for kid');
  });

  it('rejects a token issued for another audience', async () => {
    const sa = nextAccount();
    const { publicKey, privateKey } = keyPair();
    mockJwks([{ kid: 'key-a', jwk: publicKey }]);

    await expect(
      verifyJwtClaims(signWithIssuer(privateKey, sa, { kid: 'key-a' }), sa, 'https://attacker.test')
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token whose issuer does not match the service account', async () => {
    const sa = nextAccount();
    const { publicKey, privateKey } = keyPair();
    mockJwks([{ kid: 'key-a', jwk: publicKey }]);

    await expect(
      verifyJwtClaims(
        signWithIssuer(privateKey, 'someone-else@example.com', { kid: 'key-a' }),
        sa,
        'https://customer.test'
      )
    ).rejects.toThrow('Invalid issuer');
  });

  it('distinguishes a JWKS fetch failure from an invalid token', async () => {
    const sa = nextAccount();
    const { privateKey } = keyPair();
    global.fetch = jest.fn().mockRejectedValue(new Error('dns lookup failed'));

    await expect(
      verifyJwtClaims(signWithIssuer(privateKey, sa, { kid: 'key-a' }), sa, 'https://customer.test')
    ).rejects.toBeInstanceOf(JwksUnavailableError);
  });
});
