import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SCHEDULER_FACADE,
  SchedulerFacade,
} from '../../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../../common/scheduler/shared/trigger-handler.interface';
import { SyncGcpStoragesForProjectTrigger } from '../../entities/legacy-data-marts/sync-gcp-storages-for-project-trigger.entity';
import { SyncLegacyGcpStoragesForProjectService } from '../../use-cases/legacy-data-marts/sync-legacy-gcp-storages-for-project.service';

@Injectable()
export class SyncGcpStoragesForProjectTriggerHandler
  implements TriggerHandler<SyncGcpStoragesForProjectTrigger>, OnModuleInit
{
  private readonly logger = new Logger(SyncGcpStoragesForProjectTriggerHandler.name);

  constructor(
    @InjectRepository(SyncGcpStoragesForProjectTrigger)
    private readonly repository: Repository<SyncGcpStoragesForProjectTrigger>,
    @Inject(SCHEDULER_FACADE)
    private readonly schedulerFacade: SchedulerFacade,
    private readonly syncLegacyGcpStoragesForProjectService: SyncLegacyGcpStoragesForProjectService
  ) {}

  getTriggerRepository(): Repository<SyncGcpStoragesForProjectTrigger> {
    return this.repository;
  }

  async handleTrigger(trigger: SyncGcpStoragesForProjectTrigger): Promise<void> {
    this.logger.log(`Starting sync for project ${trigger.projectId}`);

    trigger.gcpProjectsCount = await this.syncLegacyGcpStoragesForProjectService.run(trigger);

    this.logger.log(
      `Sync completed for project ${trigger.projectId}. GCP storages processed: ${trigger.gcpProjectsCount}`
    );
  }

  processingCronExpression(): string {
    return '*/5 * * * * *'; // 5 seconds
  }

  stuckTriggerTimeoutSeconds(): number {
    return 60 * 60; // 1 hour;
  }

  async onModuleInit(): Promise<void> {
    await this.schedulerFacade.registerTriggerHandler(this);
  }
}
