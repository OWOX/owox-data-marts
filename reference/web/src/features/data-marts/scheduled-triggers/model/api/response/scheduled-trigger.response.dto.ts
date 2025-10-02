import { ScheduledTriggerType } from '../../../enums';
import { type ScheduledTriggerConfig } from '../../trigger-config.types';

/**
 * Response DTO for a scheduled trigger
 */
export interface ScheduledTriggerResponseApiDto {
  /**
   * Unique identifier of the trigger
   * @example 9cabc24e-1234-4a5a-8b12-abcdef123456
   */
  id: string;

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
   * Next scheduled execution time
   * @example 2024-01-01T12:00:00.000Z
   */
  nextRunTimestamp: string | null;

  /**
   * Last execution time
   * @example 2024-01-01T12:00:00.000Z
   */
  lastRunTimestamp: string | null;

  /**
   * Configuration of the trigger based on trigger type
   */
  triggerConfig: ScheduledTriggerConfig;

  /**
   * ID of the user who created the trigger
   * @example 9cabc24e-1234-4a5a-8b12-abcdef123456
   */
  createdById: string;

  /**
   * Creation timestamp
   * @example 2024-01-01T12:00:00.000Z
   */
  createdAt: string;

  /**
   * Last modification timestamp
   * @example 2024-01-02T15:30:00.000Z
   */
  modifiedAt: string;
}
