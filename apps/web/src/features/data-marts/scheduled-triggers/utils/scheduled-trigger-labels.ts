import { ScheduledTriggerType } from '../enums';

const SCHEDULED_TRIGGER_TYPE_LABELS: Record<string, string> = {
  [ScheduledTriggerType.REPORT_RUN]: 'Report Run',
  [ScheduledTriggerType.CONNECTOR_RUN]: 'Connector Run',
  [ScheduledTriggerType.DATA_QUALITY_RUN]: 'Data Quality Run',
};

export function getScheduledTriggerTypeLabel(type: string): string {
  return SCHEDULED_TRIGGER_TYPE_LABELS[type] ?? type;
}
