import { DataStorageType } from '../model/types';
import { AwsAthenaIcon, GoogleBigQueryIcon } from '../../../../shared';
import type { AppIcon } from '../../../../shared';

interface DataStorageTypeInfo {
  type: DataStorageType;
  displayName: string;
  icon: AppIcon;
}

export const DataStorageTypeModel = {
  types: {
    [DataStorageType.GOOGLE_BIGQUERY]: {
      type: DataStorageType.GOOGLE_BIGQUERY,
      displayName: 'Google BigQuery',
      icon: GoogleBigQueryIcon,
    },
    [DataStorageType.AWS_ATHENA]: {
      type: DataStorageType.AWS_ATHENA,
      displayName: 'AWS Athena',
      icon: AwsAthenaIcon,
    },
  },

  getInfo(type: DataStorageType): DataStorageTypeInfo {
    return this.types[type];
  },

  getAllTypes(): DataStorageTypeInfo[] {
    return Object.values(this.types);
  },
} as const;
