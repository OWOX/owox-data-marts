import type { ScheduledTrigger } from '../scheduled-trigger.model';
import type {
  CreateScheduledTriggerRequestApiDto,
  ScheduledTriggerResponseApiDto,
  UpdateScheduledTriggerRequestApiDto,
} from '../api';

/**
 * Interface for scheduled trigger mappers
 */
export interface TriggerMapper {
  /**
   * Maps from API DTO to model
   */
  mapFromDto(dto: ScheduledTriggerResponseApiDto): ScheduledTrigger;

  /**
   * Maps from model to create request DTO
   */
  mapToCreateRequest(model: ScheduledTrigger): CreateScheduledTriggerRequestApiDto;

  /**
   * Maps from model to update request DTO
   */
  mapToUpdateRequest(model: ScheduledTrigger): UpdateScheduledTriggerRequestApiDto;
}
