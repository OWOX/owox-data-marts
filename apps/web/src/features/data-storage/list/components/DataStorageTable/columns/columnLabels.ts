import { DataStorageColumnKey } from './columnKeys';

export const dataStorageColumnLabels: Record<DataStorageColumnKey, string> = {
  [DataStorageColumnKey.HEALTH]: 'Health status',
  [DataStorageColumnKey.TITLE]: 'Title',
  [DataStorageColumnKey.TYPE]: 'Type',
  [DataStorageColumnKey.CREATED_AT]: 'Created At',
  [DataStorageColumnKey.DATA_MARTS_COUNT]: 'Published Data Marts',
  [DataStorageColumnKey.DRAFTS_COUNT]: 'Draft Data Marts',
};
