import { Injectable, Logger } from '@nestjs/common';
import { fetchWithBackoff } from '@owox/internal-helpers';
import { GoogleAuth } from 'google-auth-library';
import {
  AppEdition,
  LICENSE_KEY_ISSUER,
  ProjectBinding,
} from '../../../common/config/app-edition-config.service';

export const LICENSE_LIFETIME_DAYS = 365;

export interface SignLicenseKeyCommand {
  licenseKeyId: string;
  origin: string;
  billingProjectId: string;
  expiresAt: Date;
}

/**
 * Signs managed license keys with the OWOX license service account.
 *
 * Uses IAM Credentials `signBlob` rather than `signJwt`, which caps token lifetime at 12
 * hours while managed licenses live for {@link LICENSE_LIFETIME_DAYS} days.
 */
@Injectable()
export class LicenseKeySignerService {
  private readonly logger = new Logger(LicenseKeySignerService.name);
  private readonly auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  public async sign(command: SignLicenseKeyCommand): Promise<string> {
    const expiresAtSeconds = Math.floor(command.expiresAt.getTime() / 1000);
    const claims = {
      iss: LICENSE_KEY_ISSUER,
      aud: command.origin,
      jti: command.licenseKeyId,
      iat: Math.floor(Date.now() / 1000),
      exp: expiresAtSeconds,
      payload: {
        licensedAppEdition: AppEdition.CLOUD_BILLED_ENTERPRISE,
        projectBinding: ProjectBinding.LICENSE,
        billingProjectId: command.billingProjectId,
        licenseExpiresAt: expiresAtSeconds,
      },
    };

    const signingInput = `${base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64Url(
      JSON.stringify(claims)
    )}`;

    return `${signingInput}.${toBase64Url(await this.signBlob(signingInput))}`;
  }

  private async signBlob(payload: string): Promise<string> {
    const accessToken = await this.auth.getAccessToken();
    const response = await fetchWithBackoff(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${LICENSE_KEY_ISSUER}:signBlob`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payload: Buffer.from(payload).toString('base64') }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`IAM signBlob failed with status ${response.status}: ${body}`);
      throw new Error(`Failed to sign the license key (IAM status ${response.status})`);
    }

    const { signedBlob } = (await response.json()) as { signedBlob: string };
    return signedBlob;
  }
}

function base64Url(value: string): string {
  return toBase64Url(Buffer.from(value).toString('base64'));
}

function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
