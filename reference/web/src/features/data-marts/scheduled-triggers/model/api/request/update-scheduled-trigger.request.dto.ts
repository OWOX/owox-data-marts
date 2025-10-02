/**
 * Request DTO for updating a scheduled trigger
 */
export interface UpdateScheduledTriggerRequestApiDto {
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
}
