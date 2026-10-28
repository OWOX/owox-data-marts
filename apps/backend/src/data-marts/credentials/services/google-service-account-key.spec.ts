import { BadRequestException } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import { serviceAccountKey } from '../../../../test/fixtures/google-service-account-key';
import { parseGoogleServiceAccountKey } from './google-service-account-key';

function refusal(value: string): string {
  try {
    parseGoogleServiceAccountKey(value);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).message;
  }
  throw new Error('expected a refusal');
}

describe('parseGoogleServiceAccountKey', () => {
  it('returns the key and its public metadata, also for a key pasted with surrounding whitespace', () => {
    const parsed = parseGoogleServiceAccountKey(`\n  ${serviceAccountKey()}  \n`);

    expect(parsed.metadata).toEqual({
      clientEmail: 'docs-writer@acme-docs.iam.gserviceaccount.com',
      projectId: 'acme-docs',
      privateKeyId: 'key-1',
      clientId: '1234567890',
    });
    expect(parsed.key.private_key).toContain('BEGIN PRIVATE KEY');
  });

  it('refuses text that is not JSON', () => {
    expect(refusal('{"type":')).toBe('The key is not valid JSON');
  });

  it('names the first schema problem without echoing the value', () => {
    const message = refusal(serviceAccountKey({ type: 'authorized_user' }));
    expect(message).toMatch(/^type: /);
    expect(refusal('null')).not.toMatch(/^: /);
  });

  it('refuses an address that is not a service account', () => {
    expect(refusal(serviceAccountKey({ client_email: 'someone@example.com' }))).toBe(
      'client_email must be a service account address'
    );
  });

  it('refuses a private key that is not RSA', () => {
    const { privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    expect(refusal(serviceAccountKey({ private_key: privateKey }))).toBe(
      'private_key must be an RSA key'
    );
    expect(
      refusal(
        serviceAccountKey({
          private_key: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n',
        })
      )
    ).toBe('private_key must be an RSA key');
  });

  it('refuses another universe', () => {
    expect(refusal(serviceAccountKey({ universe_domain: 'example-universe.com' }))).toBe(
      'Only the googleapis.com universe is supported'
    );
  });

  it('never puts the private key in a message', () => {
    const key = serviceAccountKey({ client_email: 'not-an-email' });
    const privateKey = JSON.parse(key).private_key as string;
    expect(refusal(key)).not.toContain(privateKey.slice(30, 60));
  });
});
