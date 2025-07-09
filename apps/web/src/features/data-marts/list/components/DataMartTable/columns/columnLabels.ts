import { DataMartColumnKey } from './columnKeys';

export const dataMartColumnLabels: Record<DataMartColumnKey, string> = {
  [DataMartColumnKey.TITLE]: 'Title',
  [DataMartColumnKey.DEFINITION_TYPE]: 'Source',
  [DataMartColumnKey.STORAGE_TYPE]: 'Storage',
  [DataMartColumnKey.STATUS]: 'Status',
  [DataMartColumnKey.CREATED_AT]: 'Created at',
};
