import { HttpException, HttpStatus } from '@nestjs/common';
import { DataStorageType } from '../enums/data-storage-type.enum';

export type StorageReadErrorContext = {
  storageType: DataStorageType;
  providerName: string;
};

export type StorageProviderReadError = {
  code: string;
  message: string;
  reason?: string;
  statusCode?: number;
  statusText?: string;
};

export function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createStorageReadError(
  context: StorageReadErrorContext,
  providerError: StorageProviderReadError
): HttpException {
  let providerStatus = ' returned an error';
  if (providerError.statusText) {
    providerStatus = ` returned ${providerError.statusText}`;
  } else if (providerError.statusCode) {
    providerStatus = ` returned HTTP ${providerError.statusCode}`;
  }

  return new HttpException(
    {
      code: providerError.code,
      message: `Storage dependency failed while reading this Data Mart data: ${context.providerName}${providerStatus}: ${providerError.message}`,
      details: {
        dependency: 'storage',
        providerMessage: providerError.message,
        providerName: context.providerName,
        ...(providerError.reason ? { providerReason: providerError.reason } : {}),
        ...(providerError.statusCode ? { providerStatusCode: providerError.statusCode } : {}),
        storageType: context.storageType,
      },
    },
    HttpStatus.FAILED_DEPENDENCY
  );
}
