import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { UiTriggerService } from '../../common/scheduler/shared/ui-trigger.service';
import { InsightTemplateRunResponseApiDto } from '../dto/presentation/insight-template-run-response-api.dto';
import { InsightTemplateRunTrigger } from '../entities/insight-template-run-trigger.entity';

@Injectable()
export class InsightTemplateRunTriggerService extends UiTriggerService<InsightTemplateRunResponseApiDto> {
  constructor(
    @InjectRepository(InsightTemplateRunTrigger)
    triggerRepository: Repository<InsightTemplateRunTrigger>
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

  async createTrigger(
    userId: string,
    projectId: string,
    dataMartId: string,
    insightTemplateId: string
  ): Promise<string> {
    const trigger = new InsightTemplateRunTrigger();
    trigger.userId = userId;
    trigger.projectId = projectId;
    trigger.dataMartId = dataMartId;
    trigger.insightTemplateId = insightTemplateId;
    trigger.isActive = true;
    trigger.status = TriggerStatus.IDLE;

    const saved = await this.triggerRepository.save(trigger);
    return saved.id;
  }
}
