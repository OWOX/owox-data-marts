import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';
import {
  AppEdition,
  LICENSE_KEY_ISSUER,
  ProjectBinding,
} from '../../../common/config/app-edition-config.service';
import { LICENSE_LIFETIME_DAYS, LicenseKeySignerService } from './license-key-signer.service';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

function signingKeyJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'service_account',
    project_id: 'owox-registry',
    private_key_id: 'signing-key-1',
    private_key: privatePem,
    client_email: LICENSE_KEY_ISSUER,
    client_id: '1234567890',
    client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/license',
    ...overrides,
  });
}

function createService(env: Record<string, string | undefined>): LicenseKeySignerService {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new LicenseKeySignerService(config);
}

const enabledEnv = (keyJson: string | undefined) => ({
  LICENSE_ISSUANCE_ENABLED: 'true',
  LICENSE_SIGNING_SERVICE_ACCOUNT_KEY_JSON: keyJson,
});

describe('LicenseKeySignerService', () => {
  const command = {
    licenseKeyId: 'license-key-1',
    origin: 'https://customer.test',
    billingProjectId: 'project-1',
    expiresAt: new Date(Date.now() + LICENSE_LIFETIME_DAYS * 24 * 3600 * 1000),
  };

  it('signs an RS256 token with the key id in the header and verifiable claims', () => {
    const service = createService(enabledEnv(signingKeyJson()));

    const token = service.sign(command);

    const decoded = jwt.decode(token, { complete: true })!;
    expect(decoded.header.alg).toBe('RS256');
    expect(decoded.header.kid).toBe('signing-key-1');

    const claims = jwt.verify(token, publicPem, {
      algorithms: ['RS256'],
      audience: command.origin,
    }) as jwt.JwtPayload;
    expect(claims.iss).toBe(LICENSE_KEY_ISSUER);
    expect(claims.jti).toBe(command.licenseKeyId);
    expect(claims.exp).toBe(Math.floor(command.expiresAt.getTime() / 1000));
    expect(claims.payload).toEqual({
      licensedAppEdition: AppEdition.CLOUD_BILLED_ENTERPRISE,
      projectBinding: ProjectBinding.LICENSE,
      billingProjectId: command.billingProjectId,
      licenseExpiresAt: claims.exp,
    });
  });

  it('stays inert when issuance is disabled and refuses to sign', () => {
    const service = createService({ LICENSE_ISSUANCE_ENABLED: undefined });

    expect(() => service.sign(command)).toThrow('License signing is not configured');
  });

  it('fails startup when issuance is enabled without the signing key env', () => {
    expect(() => createService(enabledEnv(undefined))).toThrow(
      'requires LICENSE_SIGNING_SERVICE_ACCOUNT_KEY_JSON'
    );
  });

  it('fails startup when the signing key env is not valid JSON', () => {
    expect(() => createService(enabledEnv('not-json'))).toThrow('is not valid JSON');
  });

  it('fails startup when the key belongs to a foreign service account', () => {
    expect(() =>
      createService(
        enabledEnv(signingKeyJson({ client_email: 'intruder@example.iam.gserviceaccount.com' }))
      )
    ).toThrow(`must belong to ${LICENSE_KEY_ISSUER}`);
  });

  it('fails startup when the private key is unusable', () => {
    const malformed = '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n';
    expect(() => createService(enabledEnv(signingKeyJson({ private_key: malformed })))).toThrow(
      'contains an unusable private key'
    );
  });
});
