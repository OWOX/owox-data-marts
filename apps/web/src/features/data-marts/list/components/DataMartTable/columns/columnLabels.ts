import { DataMartColumnKey } from './columnKeys';

export const dataMartColumnLabels: Record<DataMartColumnKey, string> = {
  [DataMartColumnKey.TITLE]: 'Title',
  [DataMartColumnKey.DEFINITION_TYPE]: 'Input Source',
  [DataMartColumnKey.STORAGE_TYPE]: 'Storage',
  [DataMartColumnKey.STATUS]: 'Status',
  [DataMartColumnKey.TRIGGERS_COUNT]: 'Triggers',
  [DataMartColumnKey.REPORTS_COUNT]: 'Reports',
  [DataMartColumnKey.CREATED_AT]: 'Created at',
  [DataMartColumnKey.CREATED_BY_USER]: 'Created by',
  [DataMartColumnKey.HEALTH_STATUS]: '',
};
