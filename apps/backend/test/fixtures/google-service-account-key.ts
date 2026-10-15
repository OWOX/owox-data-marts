import { generateKeyPairSync } from 'node:crypto';

/** A service account key in Google's JSON format with a fresh RSA key; Google never accepts it. */
export function serviceAccountKey(overrides: Record<string, unknown> = {}): string {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return JSON.stringify({
    type: 'service_account',
    project_id: 'acme-docs',
    private_key_id: 'key-1',
    private_key: privateKey,
    client_email: 'docs-writer@acme-docs.iam.gserviceaccount.com',
    client_id: '1234567890',
    client_x509_cert_url:
      'https://www.googleapis.com/robot/v1/metadata/x509/docs-writer%40acme-docs.iam.gserviceaccount.com',
    ...overrides,
  });
}
