import { HttpException, Injectable } from '@nestjs/common';
import { DataStorageType, toHumanReadable } from '../../enums/data-storage-type.enum';
import {
  createStorageReadError,
  messageFromError,
  StorageProviderReadError,
} from '../../interfaces/storage-read-error';
import {
  DataStorageErrorMapper,
  StorageReadErrorMappingOptions,
} from '../../interfaces/data-storage-error-mapper.interface';

type BigQueryErrorShape = {
  errors?: Array<{ reason?: unknown; message?: unknown }>;
  response?: {
    status?: { errorResult?: { reason?: unknown; message?: unknown } };
  };
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asBigQueryError(error: unknown): BigQueryErrorShape {
  return typeof error === 'object' && error !== null ? (error as BigQueryErrorShape) : {};
}

function responseFieldsFor(
  reason: string | undefined
): Pick<StorageProviderReadError, 'code' | 'statusCode' | 'statusText'> {
  if (reason === 'authError') {
    return { code: 'STORAGE_UNAUTHORIZED', statusCode: 401, statusText: '401 Unauthorized' };
  }
  if (reason === 'accessDenied') {
    return { code: 'STORAGE_PERMISSION_DENIED', statusCode: 403, statusText: '403 Forbidden' };
  }
  return { code: 'STORAGE_READ_FAILED' };
}

function extractBigQueryError(error: unknown): StorageProviderReadError | null {
  if (error instanceof HttpException) return null;

  const shaped = asBigQueryError(error);
  const errorResult = shaped.response?.status?.errorResult;
  const firstError = shaped.errors?.[0];
  const reason = asString(errorResult?.reason) ?? asString(firstError?.reason);
  const message = asString(errorResult?.message) ?? asString(firstError?.message);

  if (!reason && !message) return null;

  return {
    ...responseFieldsFor(reason),
    message: message ?? messageFromError(error),
    ...(reason ? { reason } : {}),
  };
}

export function mapBigQueryStorageReadError(
  type: DataStorageType,
  error: unknown,
  options: StorageReadErrorMappingOptions = {}
): unknown {
  const context = {
    storageType: type,
    providerName: toHumanReadable(type),
  };
  const providerError = extractBigQueryError(error);

  if (providerError) return createStorageReadError(context, providerError);
  if (options.force) {
    return createStorageReadError(context, {
      code: 'STORAGE_READ_FAILED',
      message: messageFromError(error),
    });
  }
  return error;
}

@Injectable()
export class BigQueryStorageErrorMapper implements DataStorageErrorMapper {
  readonly type = DataStorageType.GOOGLE_BIGQUERY;

  toStorageReadError(error: unknown, options?: StorageReadErrorMappingOptions): unknown {
    return mapBigQueryStorageReadError(this.type, error, options);
  }
}
