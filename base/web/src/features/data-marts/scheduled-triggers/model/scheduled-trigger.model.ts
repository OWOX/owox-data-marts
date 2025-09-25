import { ScheduledTriggerType } from '../enums';
import type { ScheduledConnectorRunConfig, ScheduledReportRunConfig } from './trigger-config.types';

/**
 * Scheduled Trigger model interface
 */
export interface ScheduledTrigger {
  /**
   * Unique identifier of the trigger
   */
  id: string;

  /**
   * Type of the scheduled trigger
   */
  type: ScheduledTriggerType;

  /**
   * Cron expression for scheduling
   */
  cronExpression: string;

  /**
   * Timezone for the trigger
   */
  timeZone: string;

  /**
   * Whether the trigger is active
   */
  isActive: boolean;

  /**
   * Next scheduled execution time
   */
  nextRun: Date | null;

  /**
   * Last execution time
   */
  lastRun: Date | null;

  /**
   * Configuration of the trigger
   */
  triggerConfig: TriggerConfigByType[ScheduledTriggerType];

  /**
   * ID of the user who created the trigger
   */
  createdById: string;

  /**
   * Creation timestamp
   */
  createdAt: Date;

  /**
   * Last modification timestamp
   */
  modifiedAt: Date;
}

/**
 * Maps trigger types to their respective configuration types
 */
export interface TriggerConfigByType {
  [ScheduledTriggerType.REPORT_RUN]: ScheduledReportRunConfig;
  [ScheduledTriggerType.CONNECTOR_RUN]: ScheduledConnectorRunConfig;
}
