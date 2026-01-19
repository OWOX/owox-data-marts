import { DataStorageType } from '../types';
import type { StorageMapper } from './storage-mapper.interface.ts';
import { GoogleBigQueryMapper } from './google-bigquery.mapper.ts';
import { AwsAthenaMapper } from './aws-athena.mapper.ts';
import { SnowflakeMapper } from './snowflake.mapper.ts';
import { RedshiftMapper } from './redshift.mapper.ts';
import { DatabricksMapper } from './databricks.mapper.ts';

export const StorageMapperFactory = {
  getMapper(type: DataStorageType): StorageMapper {
    switch (type) {
      case DataStorageType.GOOGLE_BIGQUERY:
        return new GoogleBigQueryMapper();
      case DataStorageType.AWS_ATHENA:
        return new AwsAthenaMapper();
      case DataStorageType.SNOWFLAKE:
        return new SnowflakeMapper();
      case DataStorageType.AWS_REDSHIFT:
        return new RedshiftMapper();
      case DataStorageType.DATABRICKS:
        return new DatabricksMapper();
      default:
        throw new Error(`Unknown storage type: ${type}`);
    }
  },
};
