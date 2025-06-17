import { DataStorageType } from '../types';
import type { StorageMapper } from './storage-mapper.interface.ts';
import { GoogleBigQueryMapper } from './google-bigquery.mapper.ts';
import { AwsAthenaMapper } from './aws-athena.mapper.ts';

export const StorageMapperFactory = {
  getMapper(type: DataStorageType): StorageMapper {
    switch (type) {
      case DataStorageType.GOOGLE_BIGQUERY:
        return new GoogleBigQueryMapper();
      case DataStorageType.AWS_ATHENA:
        return new AwsAthenaMapper();
      default:
        throw new Error(`Unknown data storage type: ${String(type)}`);
    }
  },
};
