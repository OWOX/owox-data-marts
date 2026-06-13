import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { Inject } from '@nestjs/common';
import { ADVANCED_SEARCH_CONFIG, AdvancedSearchConfig } from '../config/advanced-search.config';
import { EeLicenseService } from '../../shared/ee-license.service';
import { SearchIndexerService } from './search-indexer.service';

@Injectable()
export class IndexingCron implements OnApplicationBootstrap {
  private readonly logger = new Logger(IndexingCron.name);
  private unlicensedLogged = false;

  constructor(
    private readonly indexer: SearchIndexerService,
    private readonly eeLicense: EeLicenseService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(ADVANCED_SEARCH_CONFIG) private readonly config: AdvancedSearchConfig
  ) {}

  onApplicationBootstrap(): void {
    const job = new CronJob(this.config.reconcileCron, () => {
      void this.tick().catch((err: unknown) => {
        this.logger.error('advanced-search reconcile tick failed', err);
      });
    });
    this.schedulerRegistry.addCronJob('advanced-search.reconcile', job);
    job.start();

    if (this.isExecutionEnabled() && this.eeLicense.isLicensed()) {
      void this.indexer.reconcile().catch(err => {
        this.logger.error('Initial reconcile failed', err);
      });
    }
  }

  private async tick(): Promise<void> {
    if (!this.isExecutionEnabled()) {
      return;
    }
    if (!this.eeLicense.isLicensed()) {
      if (!this.unlicensedLogged) {
        this.logger.log('advanced-search reconcile skipped: no enterprise license');
        this.unlicensedLogged = true;
      }
      return;
    }
    this.unlicensedLogged = false;
    await this.indexer.reconcile();
  }

  private isExecutionEnabled(): boolean {
    return this.configService.get<boolean>('SCHEDULER_EXECUTION_ENABLED') === true;
  }
}
