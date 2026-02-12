import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TriggerStatus } from '../../../common/scheduler/shared/entities/trigger-status';
import { SyncDataMartsByGcpTrigger } from '../../entities/legacy-data-marts/sync-data-marts-by-gcp-trigger.entity';
import { SyncGcpStoragesForProjectTrigger } from '../../entities/legacy-data-marts/sync-gcp-storages-for-project-trigger.entity';

@Injectable()
export class LegacySyncTriggersService {
  private readonly logger = new Logger(LegacySyncTriggersService.name);

  constructor(
    @InjectRepository(SyncDataMartsByGcpTrigger)
    private readonly syncDataMartsTriggerRepository: Repository<SyncDataMartsByGcpTrigger>,
    @InjectRepository(SyncGcpStoragesForProjectTrigger)
    private readonly syncStoragesTriggerRepository: Repository<SyncGcpStoragesForProjectTrigger>
  ) {}

  async scheduleDataMartsSyncForStorageByGcp(gcpProjectId: string): Promise<void> {
    await this.syncDataMartsTriggerRepository.upsert(
      {
        gcpProjectId,
        status: TriggerStatus.IDLE,
        isActive: true,
      },
      {
        conflictPaths: ['gcpProjectId'],
      }
    );
    this.logger.log(`Data marts sync planned for GCP ${gcpProjectId}`);
  }

  async scheduleStoragesSyncForProject(projectId: string): Promise<void> {
    await this.syncStoragesTriggerRepository.upsert(
      {
        projectId,
        status: TriggerStatus.IDLE,
        isActive: true,
      },
      {
        conflictPaths: ['projectId'],
      }
    );
    this.logger.log(`Data storages sync planned for project ${projectId}`);
  }
}
