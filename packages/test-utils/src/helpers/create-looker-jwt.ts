import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

const LOOKER_STUDIO_SERVICE_ACCOUNT =
  'connector@owox-p-odm-looker-studio-001.iam.gserviceaccount.com';

const TEST_KID = 'test-kid';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function pemToJwk(pem: string): Record<string, unknown> {
  const key = crypto.createPublicKey(pem);
  const jwk = key.export({ format: 'jwk' });
  return { ...jwk, kid: TEST_KID, alg: 'RS256', use: 'sig' };
}

/**
 * Signs a Looker Studio request payload as a Google JWT.
 * The resulting token is accepted by the GoogleJwtBody decorator
 * when mockGoogleJwkFetch() is active.
 */
export function signLookerPayload(payload: unknown): string {
  return jwt.sign(
    { payload, iss: LOOKER_STUDIO_SERVICE_ACCOUNT },
    privateKey,
    {
      algorithm: 'RS256',
      keyid: TEST_KID,
    },
  );
}

let originalFetch: typeof global.fetch | undefined;

/**
 * Mocks global.fetch to intercept Google JWK certificate requests
 * and return our test RSA public key. Must be called BEFORE the first
 * request to a Looker Studio endpoint (the decorator fetches certs lazily).
 */
export function mockGoogleJwkFetch(): void {
  originalFetch = global.fetch;
  global.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('googleapis.com/service_accounts/v1/jwk')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ keys: [pemToJwk(publicKey)] }),
      } as Response);
    }
    return originalFetch!(url, init);
  }) as typeof global.fetch;
}

/**
 * Restores the original global.fetch after tests complete.
 */
export function restoreGoogleJwkFetch(): void {
  if (originalFetch) {
    global.fetch = originalFetch;
    originalFetch = undefined;
  }
}
