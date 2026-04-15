import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { UiTriggerService } from '../../common/scheduler/shared/ui-trigger.service';
import { InsightTemplateRunResponseApiDto } from '../dto/presentation/insight-template-run-response-api.dto';
import { InsightTemplateRunTrigger } from '../entities/insight-template-run-trigger.entity';
import { InsightTemplateRunRequestedEvent } from '../events/insight-template-run-requested.event';

interface CreateInsightTemplateRunTriggerParams {
  userId: string;
  projectId: string;
  dataMartId: string;
  insightTemplateId: string;
  type: 'manual' | 'chat';
  assistantMessageId?: string;
}

@Injectable()
export class InsightTemplateRunTriggerService extends UiTriggerService<InsightTemplateRunResponseApiDto> {
  constructor(
    @InjectRepository(InsightTemplateRunTrigger)
    triggerRepository: Repository<InsightTemplateRunTrigger>,
    private readonly eventDispatcher: OwoxEventDispatcher
  ) {
    super(triggerRepository);
  }

  async listByInsightTemplate(params: {
    projectId: string;
    dataMartId: string;
    insightTemplateId: string;
  }): Promise<InsightTemplateRunTrigger[]> {
    const { projectId, dataMartId, insightTemplateId } = params;
    return (this.triggerRepository as Repository<InsightTemplateRunTrigger>).find({
      where: { projectId, dataMartId, insightTemplateId },
      order: { createdAt: 'DESC' },
    });
  }

  async createTrigger(params: CreateInsightTemplateRunTriggerParams): Promise<string> {
    const trigger = new InsightTemplateRunTrigger();
    trigger.userId = params.userId;
    trigger.projectId = params.projectId;
    trigger.dataMartId = params.dataMartId;
    trigger.insightTemplateId = params.insightTemplateId;
    trigger.isActive = true;
    trigger.status = TriggerStatus.IDLE;

    const saved = await this.triggerRepository.save(trigger);

    this.eventDispatcher.publishExternalSafely(
      new InsightTemplateRunRequestedEvent({
        projectId: params.projectId,
        dataMartId: params.dataMartId,
        userId: params.userId,
        insightTemplateId: params.insightTemplateId,
        triggerId: saved.id,
        type: params.type,
        ...(params.type === 'chat'
          ? {
              assistantMessageId: params.assistantMessageId,
            }
          : {}),
      })
    );

    return saved.id;
  }
}
