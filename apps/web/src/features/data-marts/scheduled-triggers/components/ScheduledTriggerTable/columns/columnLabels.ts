import { ScheduledTriggerColumnKey } from './columnKeys';

export const ScheduledTriggerColumnLabels: Record<ScheduledTriggerColumnKey, string> = {
  [ScheduledTriggerColumnKey.TYPE]: 'Trigger Type',
  [ScheduledTriggerColumnKey.TRIGGER_CONFIG]: 'Run Target',
  [ScheduledTriggerColumnKey.CRON_EXPRESSION]: 'Schedule',
  [ScheduledTriggerColumnKey.NEXT_RUN]: 'Next Run',
  [ScheduledTriggerColumnKey.LAST_RUN]: 'Last Run',
  [ScheduledTriggerColumnKey.CREATED_AT]: 'Created At',
  [ScheduledTriggerColumnKey.CREATED_BY_USER]: 'Created By',
  [ScheduledTriggerColumnKey.IS_ACTIVE]: 'Trigger Status',
};
