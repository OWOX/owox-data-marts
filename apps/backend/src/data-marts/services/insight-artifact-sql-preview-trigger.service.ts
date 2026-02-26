import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { UiTriggerService } from '../../common/scheduler/shared/ui-trigger.service';
import { InsightArtifactSqlPreviewTriggerResponseApiDto } from '../dto/presentation/insight-artifact-sql-preview-trigger-response-api.dto';
import { InsightArtifactSqlPreviewTrigger } from '../entities/insight-artifact-sql-preview-trigger.entity';

@Injectable()
export class InsightArtifactSqlPreviewTriggerService extends UiTriggerService<InsightArtifactSqlPreviewTriggerResponseApiDto> {
  constructor(
    @InjectRepository(InsightArtifactSqlPreviewTrigger)
    triggerRepository: Repository<InsightArtifactSqlPreviewTrigger>
  ) {
    super(triggerRepository);
  }

  async createTrigger(
    userId: string,
    projectId: string,
    dataMartId: string,
    insightArtifactId: string,
    sql?: string
  ): Promise<string> {
    const trigger = new InsightArtifactSqlPreviewTrigger();
    trigger.userId = userId;
    trigger.projectId = projectId;
    trigger.dataMartId = dataMartId;
    trigger.insightArtifactId = insightArtifactId;
    trigger.sql = sql;
    trigger.isActive = true;
    trigger.status = TriggerStatus.IDLE;

    const saved = await this.triggerRepository.save(trigger);
    return saved.id;
  }
}
