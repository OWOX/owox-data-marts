import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff } from '@owox/internal-helpers';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { LegacyDataMartsService } from './legacy-data-marts.service';

jest.mock('@owox/internal-helpers', () => ({
  fetchWithBackoff: jest.fn(),
  ImpersonatedIdTokenFetcher: class {
    getIdToken = jest.fn().mockResolvedValue('token');
  },
}));

describe('LegacyDataMartsService', () => {
  const createConfigService = (values: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  const createResponse = (data: { ok: boolean; status: number; json?: unknown; text?: string }) =>
    ({
      ok: data.ok,
      status: data.status,
      json: jest.fn().mockResolvedValue(data.json),
      text: jest.fn().mockResolvedValue(data.text ?? ''),
    }) as unknown as Response;

  const configuredValues = {
    LEGACY_DATA_MARTS_ENDPOINT_BASE_URL: 'https://example.com',
    LEGACY_DATA_MARTS_ENDPOINT_AUTH_SERVICE_ACCOUNT: 'service-account@example.com',
    LEGACY_DATA_MARTS_ENDPOINT_TARGET_AUDIENCE: 'https://example.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws when service is not configured', async () => {
    const service = new LegacyDataMartsService(createConfigService({}));

    await expect(service.getGcpProjectsList('bi-project')).rejects.toThrow(
      'Legacy ODM service is not configured'
    );
    expect(fetchWithBackoff).not.toHaveBeenCalled();
  });

  it('throws when service is partially configured', () => {
    expect(
      () =>
        new LegacyDataMartsService(
          createConfigService({
            LEGACY_DATA_MARTS_ENDPOINT_BASE_URL: 'https://example.com',
          })
        )
    ).toThrow('Legacy ODM service is partially configured');
  });

  it('converts date fields in data mart details response', async () => {
    const service = new LegacyDataMartsService(createConfigService(configuredValues));
    const fetchWithBackoffMock = fetchWithBackoff as jest.MockedFunction<typeof fetchWithBackoff>;
    fetchWithBackoffMock.mockResolvedValue(
      createResponse({
        ok: true,
        status: 200,
        json: {
          id: 'data-mart-id',
          title: 'Title',
          description: null,
          query: 'select 1',
          gcpProjectId: null,
          createdAt: '2024-01-01T00:00:00Z',
          modifiedAt: null,
        },
      })
    );

    const result = await service.getDataMartDetails('bi-project', 'data-mart-id');

    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.modifiedAt).toBeNull();
    expect(fetchWithBackoffMock).toHaveBeenCalled();
  });

  it('throws BusinessViolationException on 4xx responses', async () => {
    const service = new LegacyDataMartsService(createConfigService(configuredValues));
    const fetchWithBackoffMock = fetchWithBackoff as jest.MockedFunction<typeof fetchWithBackoff>;
    fetchWithBackoffMock.mockResolvedValue(
      createResponse({
        ok: false,
        status: 404,
        text: 'Not found',
      })
    );

    await expect(service.getDataMartsList('bi-project', 'gcp-id')).rejects.toBeInstanceOf(
      BusinessViolationException
    );
  });
});
