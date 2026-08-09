import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyJwtClaims } from '../jwt-body/google-jwt-body.decorator';
import { PublicOriginService } from './public-origin.service';

export enum AppEdition {
  COMMUNITY = 'COMMUNITY',
  CLOUD_BILLED_ENTERPRISE = 'CLOUD_BILLED_ENTERPRISE',
}

export enum ProjectBinding {
  LICENSE = 'LICENSE',
  INTERNAL = 'INTERNAL',
}

export interface LicenseContext {
  binding: ProjectBinding;
  licenseKeyId: string;
}

/** Written by LicenseKeySignerService and read back by every license verifier. */
export interface LicenseKeyClaims {
  licensedAppEdition?: string;
  projectBinding?: string;
  billingProjectId?: string;
  licenseExpiresAt?: number;
}

/** Fixed OWOX identity: baked into every issued key and into the JWKS URL used to verify it. */
export const LICENSE_KEY_ISSUER = 'license@owox-registry.iam.gserviceaccount.com';
export const LICENSE_KEY_ID_HEADER = 'X-OWOX-License-Key-Id';
const LEGACY_ENTERPRISE_EDITION = 'ENTERPRISE';

const LEGACY_LICENSE_MESSAGE =
  'Legacy ENTERPRISE license keys are no longer supported. Create a managed license key in ' +
  'OWOX Data Marts Cloud Project Settings and set it as LICENSE_KEY to restore Report Run execution.';

/**
 * The `AppEditionConfig` class is responsible for managing the application edition
 * (e.g., community or enterprise editions) based on a provided license key.
 */
export class AppEditionConfig {
  private readonly logger = new Logger(AppEditionConfig.name);
  private activeEdition: AppEdition;
  private licenseContext: LicenseContext | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly publicOriginService: PublicOriginService
  ) {}

  async actualizeAppEdition(verbose?: boolean): Promise<void> {
    const licenseJwt = this.config.get<string>('LICENSE_KEY');
    if (!licenseJwt) {
      this.apply(AppEdition.COMMUNITY, null);
      return;
    }

    try {
      const audience = this.publicOriginService.normalizeOrigin(
        this.publicOriginService.getPublicOrigin()
      );
      const claims = await verifyJwtClaims(licenseJwt, LICENSE_KEY_ISSUER, audience);
      const licenseContext = this.toLicenseContext(
        claims.jti,
        claims.payload as LicenseKeyClaims | undefined
      );
      this.apply(AppEdition.CLOUD_BILLED_ENTERPRISE, licenseContext);
      if (verbose) {
        this.logger.log(`${this.activeEdition} App Edition activated based on license key.`);
      }
    } catch (error) {
      this.apply(AppEdition.COMMUNITY, null);
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to validate License Key. Falls back to ${AppEdition.COMMUNITY} edition. ${reason}`
      );
    }
  }

  public isEnterpriseEdition(): boolean {
    if (!this.activeEdition) {
      throw new Error('App Edition is not initialized');
    }
    return this.activeEdition === AppEdition.CLOUD_BILLED_ENTERPRISE;
  }

  public getLicenseContext(): LicenseContext | null {
    return this.licenseContext;
  }

  private toLicenseContext(jti: string | undefined, claims?: LicenseKeyClaims): LicenseContext {
    if (claims?.licensedAppEdition === LEGACY_ENTERPRISE_EDITION) {
      throw new Error(LEGACY_LICENSE_MESSAGE);
    }

    if (claims?.licensedAppEdition !== AppEdition.CLOUD_BILLED_ENTERPRISE) {
      throw new Error(`Unsupported licensed app edition: ${claims?.licensedAppEdition}`);
    }

    if (!jti) {
      throw new Error('License key is missing the jti identifier');
    }

    const binding = claims.projectBinding;
    if (binding !== ProjectBinding.LICENSE && binding !== ProjectBinding.INTERNAL) {
      throw new Error(`Unsupported project binding: ${binding}`);
    }

    if (binding === ProjectBinding.LICENSE && !claims.billingProjectId) {
      throw new Error(`${ProjectBinding.LICENSE} binding requires billingProjectId`);
    }

    if (binding === ProjectBinding.INTERNAL && claims.billingProjectId) {
      throw new Error(`${ProjectBinding.INTERNAL} binding must not carry billingProjectId`);
    }

    if (!claims.licenseExpiresAt) {
      throw new Error('License key is missing the licenseExpiresAt claim');
    }

    const expiresAt = new Date(claims.licenseExpiresAt * 1000);
    if (expiresAt.getTime() < Date.now()) {
      throw new Error(`License expired at ${expiresAt.toISOString()}`);
    }

    return { binding, licenseKeyId: jti };
  }

  private apply(edition: AppEdition, licenseContext: LicenseContext | null): void {
    this.licenseContext = licenseContext;
    this.activeEdition = edition;
    this.config.set('LICENSED_APP_EDITION', edition);
  }
}
