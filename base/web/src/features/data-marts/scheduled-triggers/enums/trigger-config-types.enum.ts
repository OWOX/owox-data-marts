/**
 * Constants for trigger configuration types
 */
export const TRIGGER_CONFIG_TYPES = {
  SCHEDULED_REPORT_RUN: 'scheduled-report-run-config',
  SCHEDULED_CONNECTOR_RUN: 'scheduled-connector-run-config',
} as const;

export type TriggerConfigType = (typeof TRIGGER_CONFIG_TYPES)[keyof typeof TRIGGER_CONFIG_TYPES];
