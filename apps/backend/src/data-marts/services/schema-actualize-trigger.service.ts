import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UiTriggerService } from '../../common/scheduler/shared/ui-trigger.service';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { SchemaActualizeTrigger } from '../entities/schema-actualize-trigger.entity';
import { SchemaActualizeResponseApiDto } from '../dto/presentation/schema-actualize-response-api.dto';
import { DataMartService } from './data-mart.service';
import { AccessDecisionService, Action, EntityType } from './access-decision';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';

@Injectable()
export class SchemaActualizeTriggerService extends UiTriggerService<SchemaActualizeResponseApiDto> {
  constructor(
    @InjectRepository(SchemaActualizeTrigger)
    triggerRepository: Repository<SchemaActualizeTrigger>,
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade
  ) {
    super(triggerRepository);
  }

  async createTrigger(userId: string, projectId: string, dataMartId: string): Promise<string> {
    if (!userId?.trim() || !projectId?.trim())
      throw new ForbiddenException('A requesting actor and project are required');
    const project = await this.idpProjectionsFacade.getProjectForUser(userId, projectId);
    if (project?.id !== projectId || !project.roles?.length)
      throw new ForbiddenException('Current project membership is required');
    const mart = await this.dataMartService.getByIdAndProjectId(dataMartId, projectId);
    for (const [type, id, action] of [
      [EntityType.DATA_MART, mart.id, Action.EDIT],
      [EntityType.STORAGE, mart.storage.id, Action.USE],
    ] as const) {
      if (
        !(await this.accessDecisionService.canAccess(
          userId,
          project.roles,
          type,
          id,
          action,
          projectId
        ))
      )
        throw new ForbiddenException('Schema actualization is not permitted by current access');
    }

    const trigger = new SchemaActualizeTrigger();
    trigger.userId = userId;
    trigger.projectId = projectId;
    trigger.dataMartId = dataMartId;
    trigger.isActive = true;
    trigger.status = TriggerStatus.IDLE;

    const saved = await this.triggerRepository.save(trigger);
    return saved.id;
  }
}
