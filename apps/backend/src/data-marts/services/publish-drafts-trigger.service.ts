import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UiTriggerService } from '../../common/scheduler/shared/ui-trigger.service';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { PublishDraftsTrigger } from '../entities/publish-drafts-trigger.entity';
import { PublishDataStorageDraftsResponseApiDto } from '../dto/presentation/publish-data-storage-drafts-response-api.dto';

@Injectable()
export class PublishDraftsTriggerService extends UiTriggerService<PublishDataStorageDraftsResponseApiDto> {
  constructor(
    @InjectRepository(PublishDraftsTrigger)
    triggerRepository: Repository<PublishDraftsTrigger>
  ) {
    super(triggerRepository);
  }

  async createTrigger(userId: string, projectId: string, dataStorageId: string): Promise<string> {
    const trigger = new PublishDraftsTrigger();
    trigger.userId = userId;
    trigger.projectId = projectId;
    trigger.dataStorageId = dataStorageId;
    trigger.isActive = true;
    trigger.status = TriggerStatus.IDLE;

    const saved = await this.triggerRepository.save(trigger);
    return saved.id;
  }
}
