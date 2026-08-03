import { ScheduledTriggerType } from '../../enums';
import type {
  CreateScheduledTriggerRequestApiDto,
  ScheduledTriggerResponseApiDto,
  UpdateScheduledTriggerRequestApiDto,
} from '../api';
import type { ScheduledTrigger } from '../scheduled-trigger.model';
import type { TriggerMapper } from './trigger-mapper.interface';

export class DataQualityRunTriggerMapper implements TriggerMapper {
  mapFromDto(dto: ScheduledTriggerResponseApiDto): ScheduledTrigger {
    return {
      id: dto.id,
      type: ScheduledTriggerType.DATA_QUALITY_RUN,
      cronExpression: dto.cronExpression,
      timeZone: dto.timeZone,
      isActive: dto.isActive,
      nextRun: dto.nextRunTimestamp ? new Date(dto.nextRunTimestamp) : null,
      lastRun: dto.lastRunTimestamp ? new Date(dto.lastRunTimestamp) : null,
      triggerConfig: null,
      createdById: dto.createdById,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      createdByUser: dto.createdByUser ?? null,
    };
  }

  mapToCreateRequest(model: ScheduledTrigger): CreateScheduledTriggerRequestApiDto {
    return {
      type: ScheduledTriggerType.DATA_QUALITY_RUN,
      cronExpression: model.cronExpression,
      timeZone: model.timeZone,
      isActive: model.isActive,
      triggerConfig: null,
    };
  }

  mapToUpdateRequest(model: ScheduledTrigger): UpdateScheduledTriggerRequestApiDto {
    return {
      cronExpression: model.cronExpression,
      timeZone: model.timeZone,
      isActive: model.isActive,
    };
  }
}
