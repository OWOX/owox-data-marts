import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { UiTriggerService } from '../../common/scheduler/shared/ui-trigger.service';
import { DataMartMetadataScope } from '../ai-insights/ai-insights-types';
import { AiHelperTrigger, AiHelperUiResponse } from '../entities/ai-helper-trigger.entity';

/**
 * Service for managing AI helper triggers.
 *
 * The base `UiTriggerService` already provides status / response / abort lifecycle
 * methods; this subclass adds the create-with-payload entry point that the controller
 * uses when accepting an AI metadata generation request.
 */
@Injectable()
export class AiHelperTriggerService extends UiTriggerService<AiHelperUiResponse> {
  constructor(
    @InjectRepository(AiHelperTrigger)
    triggerRepository: Repository<AiHelperTrigger>
  ) {
    super(triggerRepository);
  }

  /**
   * Persist a new AI helper trigger in `IDLE` status. The scheduler will pick it up on
   * its next tick and the handler will run the actual generation.
   *
   * @returns ID of the created trigger
   */
  async createTrigger(
    userId: string,
    projectId: string,
    dataMartId: string,
    scope: DataMartMetadataScope,
    useSample: boolean,
    fieldName: string | null
  ): Promise<string> {
    const trigger = new AiHelperTrigger();
    trigger.userId = userId;
    trigger.projectId = projectId;
    trigger.dataMartId = dataMartId;
    trigger.scope = scope;
    trigger.useSample = useSample;
    trigger.fieldName = fieldName;
    trigger.isActive = true;
    trigger.status = TriggerStatus.IDLE;

    const saved = await this.triggerRepository.save(trigger);
    return saved.id;
  }
}
