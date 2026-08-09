import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrivateKey } from 'crypto';
import * as jwt from 'jsonwebtoken';
import {
  AppEdition,
  LICENSE_KEY_ISSUER,
  LicenseKeyClaims,
  ProjectBinding,
} from '../../../common/config/app-edition-config.service';
import { GoogleServiceAccountKeySchema } from '../../../common/schemas/google-service-account-key.schema';

export const LICENSE_LIFETIME_DAYS = 365;

export interface SignLicenseKeyCommand {
  licenseKeyId: string;
  origin: string;
  billingProjectId: string;
  expiresAt: Date;
}

interface SigningKey {
  privateKey: string;
  keyId: string;
}

/**
 * Signs with a user-managed key of the OWOX license service account: Google keeps its public
 * key published on the account's JWK endpoint indefinitely, so 365-day tokens stay verifiable.
 * Google-managed signing (IAM signBlob/signJwt) rotates keys and unpublishes old public keys.
 */
@Injectable()
export class LicenseKeySignerService {
  private readonly signingKey?: SigningKey;

  constructor(config: ConfigService) {
    if (config.get<string>('LICENSE_ISSUANCE_ENABLED') !== 'true') {
      return;
    }
    this.signingKey = loadSigningKey(
      config.get<string>('LICENSE_SIGNING_SERVICE_ACCOUNT_KEY_JSON')
    );
  }

  public sign(command: SignLicenseKeyCommand): string {
    if (!this.signingKey) {
      throw new Error('License signing is not configured');
    }

    const expiresAtSeconds = Math.floor(command.expiresAt.getTime() / 1000);
    const payload: LicenseKeyClaims = {
      licensedAppEdition: AppEdition.CLOUD_BILLED_ENTERPRISE,
      projectBinding: ProjectBinding.LICENSE,
      billingProjectId: command.billingProjectId,
      licenseExpiresAt: expiresAtSeconds,
    };

    return jwt.sign(
      {
        iss: LICENSE_KEY_ISSUER,
        aud: command.origin,
        jti: command.licenseKeyId,
        iat: Math.floor(Date.now() / 1000),
        exp: expiresAtSeconds,
        payload,
      },
      this.signingKey.privateKey,
      { algorithm: 'RS256', keyid: this.signingKey.keyId }
    );
  }
}

function loadSigningKey(rawKeyJson: string | undefined): SigningKey {
  if (!rawKeyJson) {
    throw new Error(
      'LICENSE_ISSUANCE_ENABLED requires LICENSE_SIGNING_SERVICE_ACCOUNT_KEY_JSON with a ' +
        'user-managed key of the OWOX license service account'
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawKeyJson);
  } catch {
    throw new Error('LICENSE_SIGNING_SERVICE_ACCOUNT_KEY_JSON is not valid JSON');
  }

  const key = GoogleServiceAccountKeySchema.parse(parsed);
  if (key.client_email !== LICENSE_KEY_ISSUER) {
    throw new Error(`The license signing key must belong to ${LICENSE_KEY_ISSUER}`);
  }

  try {
    createPrivateKey(key.private_key);
  } catch {
    throw new Error('LICENSE_SIGNING_SERVICE_ACCOUNT_KEY_JSON contains an unusable private key');
  }

  return { privateKey: key.private_key, keyId: key.private_key_id };
}
