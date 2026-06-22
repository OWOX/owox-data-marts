import { BigQueryAccessValidator } from './bigquery-access.validator';
import { BigQueryApiAdapter } from '../adapters/bigquery-api.adapter';
import { BIGQUERY_OAUTH_TYPE } from '../schemas/bigquery-credentials.schema';
import {
  ValidationResultCode,
  type ValidationResult,
} from '../../interfaces/data-storage-access-validator.interface';
import type { DataStorageConfig } from '../../data-storage-config.type';
import type { DataStorageCredentials } from '../../data-storage-credentials.type';

jest.mock('../adapters/bigquery-api.adapter');

const MockedAdapter = BigQueryApiAdapter as jest.MockedClass<typeof BigQueryApiAdapter>;

describe('BigQueryAccessValidator (OAuth)', () => {
  const validator = new BigQueryAccessValidator();
  const config = { projectId: 'test-project' } as unknown as DataStorageConfig;
  const oauthCredentials = {
    type: BIGQUERY_OAUTH_TYPE,
    oauth2Client: {},
  } as unknown as DataStorageCredentials;

  const mockCheckAccess = (impl: () => Promise<void>) => {
    MockedAdapter.mockImplementation(
      () => ({ checkAccess: impl }) as unknown as BigQueryApiAdapter
    );
  };

  const validate = (): Promise<ValidationResult> => validator.validate(config, oauthCredentials);

  beforeEach(() => {
    MockedAdapter.mockReset();
  });

  it('returns valid when access check succeeds', async () => {
    mockCheckAccess(() => Promise.resolve());

    const result = await validate();

    expect(result.valid).toBe(true);
  });

  it('flags reauth on a structured HTTP 401 from the BigQuery API', async () => {
    mockCheckAccess(() => Promise.reject(Object.assign(new Error('Unauthorized'), { code: 401 })));

    const result = await validate();

    expect(result.valid).toBe(false);
    expect(result.code).toBe(ValidationResultCode.OAUTH_REAUTH_REQUIRED);
  });

  it('flags reauth when an invalid access token is rejected (message fallback)', async () => {
    mockCheckAccess(() =>
      Promise.reject(new Error('Request had invalid authentication credentials. Expected OAuth 2'))
    );

    const result = await validate();

    expect(result.valid).toBe(false);
    expect(result.code).toBe(ValidationResultCode.OAUTH_REAUTH_REQUIRED);
  });

  it('flags reauth when an on-demand refresh fails with invalid_grant in the message', async () => {
    mockCheckAccess(() =>
      Promise.reject(new Error('invalid_grant: Token has been expired or revoked.'))
    );

    const result = await validate();

    expect(result.valid).toBe(false);
    expect(result.code).toBe(ValidationResultCode.OAUTH_REAUTH_REQUIRED);
  });

  it('flags reauth when invalid_grant surfaces in a structured Google error body', async () => {
    mockCheckAccess(() =>
      Promise.reject(
        Object.assign(new Error('Refresh failed'), {
          response: { data: { error: 'invalid_grant', error_description: 'Token revoked' } },
        })
      )
    );

    const result = await validate();

    expect(result.valid).toBe(false);
    expect(result.code).toBe(ValidationResultCode.OAUTH_REAUTH_REQUIRED);
  });

  it('does not flag reauth for an unrelated failure', async () => {
    mockCheckAccess(() => Promise.reject(new Error('Dataset not found')));

    const result = await validate();

    expect(result.valid).toBe(false);
    expect(result.code).toBeUndefined();
  });
});
