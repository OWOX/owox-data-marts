import {
  ScheduledReportRunConfig,
  ScheduledReportRunConfigSchema,
} from './scheduled-report-run/schemas/scheduled-report-run-config.schema';
import {
  ScheduledTriggerConfig,
  ScheduledTriggerConfigSchema,
} from './scheduled-trigger-config.type';

export function isValidScheduledTriggerConfig(
  triggerConfig: unknown
): triggerConfig is ScheduledTriggerConfig {
  return ScheduledTriggerConfigSchema.safeParse(triggerConfig).success;
}

export function isScheduledReportRunConfig(
  triggerConfig: ScheduledTriggerConfig | undefined
): triggerConfig is ScheduledReportRunConfig {
  return ScheduledReportRunConfigSchema.safeParse(triggerConfig).success;
}
