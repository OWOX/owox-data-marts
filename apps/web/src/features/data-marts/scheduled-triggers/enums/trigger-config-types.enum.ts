/**
 * Constants for trigger configuration types
 */
export const TRIGGER_CONFIG_TYPES = {
  SCHEDULED_REPORT_RUN: 'scheduled-report-run-config',
} as const;

export type TriggerConfigType = (typeof TRIGGER_CONFIG_TYPES)[keyof typeof TRIGGER_CONFIG_TYPES];
