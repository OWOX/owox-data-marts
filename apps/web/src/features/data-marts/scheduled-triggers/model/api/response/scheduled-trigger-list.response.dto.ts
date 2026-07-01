import {
  type ProjectScheduledTriggerResponseApiDto,
  type ScheduledTriggerResponseApiDto,
} from './scheduled-trigger.response.dto';

/**
 * Response DTO for a list of scheduled triggers
 */
export type ScheduledTriggerListResponseApiDto = ScheduledTriggerResponseApiDto[];

export interface ProjectScheduledTriggerListResponseApiDto {
  triggers: ProjectScheduledTriggerResponseApiDto[];
}
