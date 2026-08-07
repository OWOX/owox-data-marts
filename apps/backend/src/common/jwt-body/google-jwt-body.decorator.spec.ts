import { UnauthorizedException } from '@nestjs/common';
import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { verifyJwtClaims } from './google-jwt-body.decorator';

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

  it('verifies a kid-less token against any active signing key', async () => {
    const sa = nextAccount();
    const first = keyPair();
    const second = keyPair();
    mockJwks([
      { kid: 'key-a', jwk: first.publicKey },
      { kid: 'key-b', jwk: second.publicKey },
    ]);

    const claims = await verifyJwtClaims(
      signWithIssuer(second.privateKey, sa),
      sa,
      'https://customer.test'
    );

    expect(claims.payload).toEqual({ ok: true });
  });

  it('rejects a kid-less token signed by a key the account does not publish', async () => {
    const sa = nextAccount();
    const published = keyPair();
    const foreign = keyPair();
    mockJwks([{ kid: 'key-a', jwk: published.publicKey }]);

    await expect(
      verifyJwtClaims(signWithIssuer(foreign.privateKey, sa), sa, 'https://customer.test')
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token issued for another audience', async () => {
    const sa = nextAccount();
    const { publicKey, privateKey } = keyPair();
    mockJwks([{ kid: 'key-a', jwk: publicKey }]);

    await expect(
      verifyJwtClaims(signWithIssuer(privateKey, sa), sa, 'https://attacker.test')
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token whose issuer does not match the service account', async () => {
    const sa = nextAccount();
    const { publicKey, privateKey } = keyPair();
    mockJwks([{ kid: 'key-a', jwk: publicKey }]);

    await expect(
      verifyJwtClaims(
        signWithIssuer(privateKey, 'someone-else@example.com'),
        sa,
        'https://customer.test'
      )
    ).rejects.toThrow('Invalid issuer');
  });

  it('rejects when the account publishes no keys at all', async () => {
    const sa = nextAccount();
    const { privateKey } = keyPair();
    mockJwks([]);

    await expect(
      verifyJwtClaims(signWithIssuer(privateKey, sa), sa, 'https://customer.test')
    ).rejects.toThrow('No public key available');
  });
});
