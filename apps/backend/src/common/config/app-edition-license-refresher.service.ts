import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AppEditionConfig } from './app-edition-config.service';

/**
 * Runs license actualization every 15 minutes using cron schedule.
 * The first check happens during AppEditionConfig factory initialization,
 * this job handles subsequent checks.
 */
@Injectable()
export class AppEditionLicenseRefresherService {
  private readonly logger = new Logger(AppEditionLicenseRefresherService.name);

  constructor(private readonly appEdition: AppEditionConfig) {}

  @Cron('0 */15 * * * *')
  async checkLicense(): Promise<void> {
    try {
      await this.appEdition.actualizeAppEdition(false);
    } catch (error) {
      this.logger.error('Scheduled license check failed', error as Error);
    }
  }
}
