import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { UiTriggerService } from '../../common/scheduler/shared/ui-trigger.service';
import { InsightRunResponseApiDto } from '../dto/presentation/insight-run-response-api.dto';
import { InsightRunTrigger } from '../entities/insight-run-trigger.entity';

@Injectable()
export class InsightRunTriggerService extends UiTriggerService<InsightRunResponseApiDto> {
  constructor(
    @InjectRepository(InsightRunTrigger)
    triggerRepository: Repository<InsightRunTrigger>
  ) {
    super(triggerRepository);
  }

  async listByInsight(params: {
    projectId: string;
    dataMartId: string;
    insightId: string;
  }): Promise<InsightRunTrigger[]> {
    const { projectId, dataMartId, insightId } = params;
    return (this.triggerRepository as Repository<InsightRunTrigger>).find({
      where: { projectId, dataMartId, insightId },
      order: { createdAt: 'DESC' },
    });
  }

  async createTrigger(
    userId: string,
    projectId: string,
    dataMartId: string,
    insightId: string
  ): Promise<string> {
    const trigger = new InsightRunTrigger();
    trigger.userId = userId;
    trigger.projectId = projectId;
    trigger.dataMartId = dataMartId;
    trigger.insightId = insightId;
    trigger.isActive = true;
    trigger.status = TriggerStatus.IDLE;

    const saved = await this.triggerRepository.save(trigger);
    return saved.id;
  }
}
