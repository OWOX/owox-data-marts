import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SCHEDULER_FACADE,
  SchedulerFacade,
} from '../../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../../common/scheduler/shared/trigger-handler.interface';
import { SyncDataMartsByGcpTrigger } from '../../entities/legacy-data-marts/sync-data-marts-by-gcp-trigger.entity';
import { SyncLegacyDataMartsByGcpService } from '../../use-cases/legacy-data-marts/sync-legacy-data-marts-by-gcp.service';

@Injectable()
export class SyncDataMartsByGcpTriggerHandler
  implements TriggerHandler<SyncDataMartsByGcpTrigger>, OnModuleInit
{
  private readonly logger = new Logger(SyncDataMartsByGcpTriggerHandler.name);

  constructor(
    @InjectRepository(SyncDataMartsByGcpTrigger)
    private readonly repository: Repository<SyncDataMartsByGcpTrigger>,
    @Inject(SCHEDULER_FACADE)
    private readonly schedulerFacade: SchedulerFacade,
    private readonly syncLegacyDataMartsByProjectService: SyncLegacyDataMartsByGcpService
  ) {}

  getTriggerRepository(): Repository<SyncDataMartsByGcpTrigger> {
    return this.repository;
  }

  async handleTrigger(trigger: SyncDataMartsByGcpTrigger): Promise<void> {
    this.logger.log(`Starting data marts sync for GCP: ${trigger.gcpProjectId}`);

    trigger.dataMartsCount = await this.syncLegacyDataMartsByProjectService.run({
      gcpProjectId: trigger.gcpProjectId,
    });

    this.logger.log(
      `Data marts sync completed for gcp: ${trigger.gcpProjectId}. Data marts synced: ${trigger.dataMartsCount}`
    );
  }

  processingCronExpression(): string {
    return '*/30 * * * * *'; // 30 seconds
  }

  stuckTriggerTimeoutSeconds(): number {
    return 60 * 60; // 1 hour;
  }

  async onModuleInit(): Promise<void> {
    await this.schedulerFacade.registerTriggerHandler(this);
  }
}
