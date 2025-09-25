import { ScheduledTriggerType } from '../../../enums';
import type { ScheduledTriggerConfig } from '../../trigger-config.types.ts';

/**
 * Request DTO for creating a scheduled trigger
 */
export interface CreateScheduledTriggerRequestApiDto {
  /**
   * Type of the scheduled trigger
   * @example CONNECTOR_RUN
   */
  type: ScheduledTriggerType;

  /**
   * Cron expression for scheduling
   * @example 0 0 * * *
   */
  cronExpression: string;

  /**
   * Timezone for the trigger
   * @example UTC
   */
  timeZone: string;

  /**
   * Whether the trigger is active
   * @example true
   */
  isActive: boolean;

  /**
   * Configuration of the trigger
   */
  triggerConfig: ScheduledTriggerConfig;
}
