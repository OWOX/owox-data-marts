import type { TriggerMapper } from './trigger-mapper.interface';
import type { ScheduledTriggerResponseApiDto } from '../api';
import type { ScheduledTrigger } from '../scheduled-trigger.model';
import type { CreateScheduledTriggerRequestApiDto } from '../api';
import type { UpdateScheduledTriggerRequestApiDto } from '../api';
import { ScheduledTriggerType } from '../../enums';
import type { ScheduledConnectorRunConfig } from '../trigger-config.types';

/**
 * Mapper for connector run triggers
 */
export class ConnectorRunTriggerMapper implements TriggerMapper {
  /**
   * Maps from API DTO to model
   */
  mapFromDto(dto: ScheduledTriggerResponseApiDto): ScheduledTrigger {
    return {
      id: dto.id,
      type: dto.type,
      cronExpression: dto.cronExpression,
      timeZone: dto.timeZone,
      isActive: dto.isActive,
      nextRun: dto.nextRunTimestamp ? new Date(dto.nextRunTimestamp) : null,
      lastRun: dto.lastRunTimestamp ? new Date(dto.lastRunTimestamp) : null,
      triggerConfig: dto.triggerConfig as ScheduledConnectorRunConfig,
      createdById: dto.createdById,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
    };
  }

  /**
   * Maps from model to create request DTO
   */
  mapToCreateRequest(model: ScheduledTrigger): CreateScheduledTriggerRequestApiDto {
    return {
      type: ScheduledTriggerType.CONNECTOR_RUN,
      cronExpression: model.cronExpression,
      timeZone: model.timeZone,
      isActive: model.isActive,
      triggerConfig: model.triggerConfig,
    };
  }

  /**
   * Maps from model to update request DTO
   */
  mapToUpdateRequest(model: ScheduledTrigger): UpdateScheduledTriggerRequestApiDto {
    return {
      cronExpression: model.cronExpression,
      timeZone: model.timeZone,
      isActive: model.isActive,
    };
  }
}
