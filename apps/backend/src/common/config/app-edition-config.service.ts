import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateJwt } from '../jwt-body/google-jwt-body.decorator';

export enum AppEdition {
  COMMUNITY = 'COMMUNITY',
  ENTERPRISE = 'ENTERPRISE',
}

export interface LicensePayload {
  licensedAppEdition: AppEdition;
  licenseExpiresAt: number;
}

const LICENSE_KEY_ISSUER = 'license@owox-registry.iam.gserviceaccount.com';

/**
 * The `AppEditionConfig` class is responsible for managing the application edition
 * (e.g., community or enterprise editions) based on a provided license key.
 */
export class AppEditionConfig {
  private readonly logger = new Logger(AppEditionConfig.name);
  private activeEdition: AppEdition;

  constructor(private readonly config: ConfigService) {}

  async actualizeAppEdition(verbose?: boolean): Promise<void> {
    const licenseJwt = this.config.get<string>('LICENSE_KEY');
    if (!licenseJwt) {
      this.setEdition(AppEdition.COMMUNITY);
      return;
    }

    try {
      const licensePayload = (await validateJwt(
        licenseJwt,
        LICENSE_KEY_ISSUER,
        this.config.get('PUBLIC_ORIGIN')
      )) as LicensePayload;

      if (licensePayload.licenseExpiresAt * 1000 < Date.now()) {
        this.setEdition(AppEdition.COMMUNITY);
        this.logger.error(
          `Your license has expired. Falls back to ${AppEdition.COMMUNITY} edition.`
        );
        return;
      }

      this.setEdition(licensePayload.licensedAppEdition);
      if (verbose) {
        this.logger.log(`${this.activeEdition} App Edition activated based on license key.`);
      }
    } catch (error) {
      this.setEdition(AppEdition.COMMUNITY);
      this.logger.error(
        `Failed to validate License Key. Falls back to ${AppEdition.COMMUNITY} edition.`,
        error
      );
    }
  }

  public isEnterpriseEdition(): boolean {
    if (!this.activeEdition) {
      throw new Error('App Edition is not initialized');
    }
    return this.activeEdition === AppEdition.ENTERPRISE;
  }

  private setEdition(edition: AppEdition): void {
    this.activeEdition = edition;
    this.config.set('LICENSED_APP_EDITION', edition);
  }
}
