import { z } from 'zod';
import { ScheduledTriggerType, TRIGGER_CONFIG_TYPES } from '../enums';

/**
 * Schema for the scheduled report run configuration
 */
const scheduledReportRunConfigSchema = z.object({
  type: z.literal(TRIGGER_CONFIG_TYPES.SCHEDULED_REPORT_RUN),
  reportId: z.string().min(1, 'Report ID is required'),
});

/**
 * Schema for the scheduled connector run configuration
 */
const scheduledConnectorRunConfigSchema = z.null();

/**
 * Schema for the scheduled trigger form
 */
export const scheduledTriggerSchema = z.object({
  type: z.nativeEnum(ScheduledTriggerType),
  cronExpression: z.string().min(1, 'Cron expression is required'),
  timeZone: z.string().min(1, 'Time zone is required'),
  isActive: z.boolean(),
  triggerConfig: z.union([scheduledReportRunConfigSchema, scheduledConnectorRunConfigSchema]),
});

/**
 * Type for the scheduled trigger form data
 */
export type ScheduledTriggerFormData = z.infer<typeof scheduledTriggerSchema>;
