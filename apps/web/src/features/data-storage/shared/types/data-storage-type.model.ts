import { DataStorageType, DataStorageStatus } from '../model/types';
import {
  AwsAthenaIcon,
  GoogleBigQueryIcon,
  SnowflakeIcon,
  DatabricksIcon,
  AwsRedshiftIcon,
  AzureSynapseIcon,
} from '../../../../shared';
import type { AppIcon } from '../../../../shared';

interface DataStorageTypeInfo {
  type: DataStorageType;
  displayName: string;
  icon: AppIcon;
  status: DataStorageStatus;
}

export const DataStorageTypeModel = {
  types: {
    [DataStorageType.GOOGLE_BIGQUERY]: {
      type: DataStorageType.GOOGLE_BIGQUERY,
      displayName: 'Google BigQuery',
      icon: GoogleBigQueryIcon,
      status: DataStorageStatus.ACTIVE,
    },
    [DataStorageType.AWS_ATHENA]: {
      type: DataStorageType.AWS_ATHENA,
      displayName: 'AWS Athena',
      icon: AwsAthenaIcon,
      status: DataStorageStatus.ACTIVE,
    },
    [DataStorageType.SNOWFLAKE]: {
      type: DataStorageType.SNOWFLAKE,
      displayName: 'Snowflake',
      icon: SnowflakeIcon,
      status: DataStorageStatus.ACTIVE,
    },
    [DataStorageType.AWS_REDSHIFT]: {
      type: DataStorageType.AWS_REDSHIFT,
      displayName: 'AWS Redshift',
      icon: AwsRedshiftIcon,
      status: DataStorageStatus.ACTIVE,
    },
    [DataStorageType.DATABRICKS]: {
      type: DataStorageType.DATABRICKS,
      displayName: 'Databricks',
      icon: DatabricksIcon,
      status: DataStorageStatus.COMING_SOON,
    },
    [DataStorageType.AZURE_SYNAPSE]: {
      type: DataStorageType.AZURE_SYNAPSE,
      displayName: 'Azure Synapse',
      icon: AzureSynapseIcon,
      status: DataStorageStatus.COMING_SOON,
    },
  },

  getInfo(type: DataStorageType): DataStorageTypeInfo {
    return this.types[type];
  },

  getAllTypes(): DataStorageTypeInfo[] {
    return Object.values(this.types);
  },
} as const;
