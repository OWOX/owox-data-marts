import { HttpException, HttpStatus } from '@nestjs/common';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { createStorageReadError, messageFromError } from './storage-read-error';

function expectHttpException(error: unknown): HttpException {
  expect(error).toBeInstanceOf(HttpException);
  return error as HttpException;
}

describe('storage read errors', () => {
  it('creates a 424 failed dependency response from explicit provider details', () => {
    const mapped = expectHttpException(
      createStorageReadError(
        { storageType: DataStorageType.SNOWFLAKE, providerName: 'Test storage' },
        {
          code: 'STORAGE_PERMISSION_DENIED',
          message: 'Access Denied: missing storage permission.',
          reason: 'accessDenied',
          statusCode: 403,
          statusText: '403 Forbidden',
        }
      )
    );

    expect(mapped.getStatus()).toBe(HttpStatus.FAILED_DEPENDENCY);
    expect(mapped.getResponse()).toMatchObject({
      code: 'STORAGE_PERMISSION_DENIED',
      message: expect.stringContaining('Test storage returned 403 Forbidden'),
      details: {
        dependency: 'storage',
        providerMessage: 'Access Denied: missing storage permission.',
        providerName: 'Test storage',
        providerReason: 'accessDenied',
        providerStatusCode: 403,
        storageType: DataStorageType.SNOWFLAKE,
      },
    });
  });

  it('extracts a short message from unknown errors without mapping them', () => {
    expect(messageFromError(new Error('Invalid cast at [57:23]'))).toBe('Invalid cast at [57:23]');
    expect(messageFromError('plain failure')).toBe('plain failure');
  });
});
