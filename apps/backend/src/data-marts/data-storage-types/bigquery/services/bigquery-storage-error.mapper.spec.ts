import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { BigQueryStorageErrorMapper } from './bigquery-storage-error.mapper';

function bigQueryAccessDeniedError(): Error {
  const message =
    'Access Denied: Project test-project: User does not have bigquery.datasets.create permission in project test-project.';
  const error = new Error(message) as Error & {
    errors: Array<{ reason: string; message: string }>;
    response: {
      status: { errorResult: { reason: string; message: string } };
    };
  };
  error.errors = [{ reason: 'accessDenied', message }];
  error.response = {
    status: { errorResult: { reason: 'accessDenied', message } },
  };
  return error;
}

function expectHttpException(error: unknown): HttpException {
  expect(error).toBeInstanceOf(HttpException);
  return error as HttpException;
}

describe('BigQueryStorageErrorMapper', () => {
  const mapper = new BigQueryStorageErrorMapper();

  it('maps raw BigQuery access denied errors before reader resolution', () => {
    const mapped = expectHttpException(mapper.toStorageReadError(bigQueryAccessDeniedError()));

    expect(mapped.getStatus()).toBe(HttpStatus.FAILED_DEPENDENCY);
    expect(mapped.getResponse()).toMatchObject({
      code: 'STORAGE_PERMISSION_DENIED',
      message: expect.stringContaining('Google BigQuery returned 403 Forbidden'),
      details: {
        dependency: 'storage',
        providerMessage: expect.stringContaining('bigquery.datasets.create'),
        providerName: 'Google BigQuery',
        providerReason: 'accessDenied',
        providerStatusCode: 403,
        storageType: DataStorageType.GOOGLE_BIGQUERY,
      },
    });
  });

  it('preserves app HttpExceptions', () => {
    const original = new BadRequestException('Invalid request');
    expect(mapper.toStorageReadError(original)).toBe(original);
  });

  it('maps plain storage read failures when already in storage-read scope', () => {
    const mapped = expectHttpException(
      mapper.toStorageReadError(new Error('Invalid cast at [57:23]'), { force: true })
    );

    expect(mapped.getStatus()).toBe(HttpStatus.FAILED_DEPENDENCY);
    expect(mapped.getResponse()).toMatchObject({
      code: 'STORAGE_READ_FAILED',
      details: {
        dependency: 'storage',
        providerMessage: 'Invalid cast at [57:23]',
        providerName: 'Google BigQuery',
      },
    });
  });
});
