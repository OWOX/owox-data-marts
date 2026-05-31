import { HttpException, Injectable } from '@nestjs/common';
import { DataStorageType, toHumanReadable } from '../../enums/data-storage-type.enum';
import {
  DataStorageErrorMapper,
  StorageReadErrorMappingOptions,
} from '../../interfaces/data-storage-error-mapper.interface';
import { createStorageReadError, messageFromError } from '../../interfaces/storage-read-error';

@Injectable()
export class DatabricksStorageErrorMapper implements DataStorageErrorMapper {
  readonly type = DataStorageType.DATABRICKS;

  toStorageReadError(error: unknown, options?: StorageReadErrorMappingOptions): unknown {
    if (error instanceof HttpException || !options?.force) return error;

    return createStorageReadError(
      { storageType: this.type, providerName: toHumanReadable(this.type) },
      { code: 'STORAGE_READ_FAILED', message: messageFromError(error) }
    );
  }
}
