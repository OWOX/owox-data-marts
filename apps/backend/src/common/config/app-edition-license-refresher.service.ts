import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppEditionConfig } from './app-edition-config.service';

/**
 * Runs hourly license actualization using cron schedule.
 * The first check happens during AppEditionConfig factory initialization,
 * this job handles subsequent hourly checks.
 */
@Injectable()
export class AppEditionLicenseRefresherService {
  private readonly logger = new Logger(AppEditionLicenseRefresherService.name);

  constructor(private readonly appEdition: AppEditionConfig) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkLicenseHourly(): Promise<void> {
    try {
      await this.appEdition.actualizeAppEdition(false);
    } catch (error) {
      this.logger.error('Hourly license check failed', error as Error);
    }
  }
}
