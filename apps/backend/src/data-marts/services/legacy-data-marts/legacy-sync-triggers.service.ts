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
    let trigger = await this.syncDataMartsTriggerRepository.findOne({
      where: {
        gcpProjectId,
      },
    });

    if (trigger) {
      trigger.status = TriggerStatus.IDLE;
      trigger.isActive = true;
    } else {
      trigger = this.syncDataMartsTriggerRepository.create({
        gcpProjectId,
        status: TriggerStatus.IDLE,
        isActive: true,
      });
    }

    await this.syncDataMartsTriggerRepository.save(trigger);
    this.logger.log(`Data marts sync planned for GCP ${gcpProjectId}`);
  }

  async scheduleStoragesSyncForProject(projectId: string): Promise<void> {
    let trigger = await this.syncStoragesTriggerRepository.findOne({
      where: {
        projectId,
      },
    });

    if (trigger) {
      trigger.status = TriggerStatus.IDLE;
      trigger.isActive = true;
    } else {
      trigger = this.syncStoragesTriggerRepository.create({
        projectId,
        status: TriggerStatus.IDLE,
        isActive: true,
      });
    }

    await this.syncStoragesTriggerRepository.save(trigger);
    this.logger.log(`Data storages sync planned for project ${projectId}`);
  }
}
