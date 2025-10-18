import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UiTriggerService } from '../../common/scheduler/shared/ui-trigger.service';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { SchemaActualizeTrigger } from '../entities/schema-actualize-trigger.entity';
import { SchemaActualizeResponseApiDto } from '../dto/presentation/schema-actualize-response-api.dto';

@Injectable()
export class SchemaActualizeTriggerService extends UiTriggerService<SchemaActualizeResponseApiDto> {
  constructor(
    @InjectRepository(SchemaActualizeTrigger)
    triggerRepository: Repository<SchemaActualizeTrigger>
  ) {
    super(triggerRepository);
  }

  async createTrigger(userId: string, projectId: string, dataMartId: string): Promise<string> {
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
