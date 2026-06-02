import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../../enums/data-storage-type.enum';
import {
  DataStorageErrorMapper,
  StorageReadErrorMappingOptions,
} from '../../../interfaces/data-storage-error-mapper.interface';
import { mapBigQueryStorageReadError } from '../bigquery-storage-error.mapper';

@Injectable()
export class LegacyBigQueryStorageErrorMapper implements DataStorageErrorMapper {
  readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

  toStorageReadError(error: unknown, options?: StorageReadErrorMappingOptions): unknown {
    return mapBigQueryStorageReadError(this.type, error, options);
  }
}
