jest.mock('@owox/internal-helpers', () => ({
  fetchWithBackoff: jest.fn(),
  ImpersonatedIdTokenFetcher: jest
    .fn()
    .mockImplementation(() => ({ getIdToken: async () => 'server-token' })),
}));
import { fetchWithBackoff } from '@owox/internal-helpers';
import { LegacyDataMartsService } from './legacy-data-marts.service';

describe('Legacy Data Mart external dispatch boundary', () => {
  let originalFetch: typeof fetch;
  let service: LegacyDataMartsService;
  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn();
    jest.clearAllMocks();
    service = new LegacyDataMartsService({
      get: (key: string) =>
        ({
          LEGACY_DATA_MARTS_ENDPOINT_AUTH_SERVICE_ACCOUNT: 'server@example.test',
          LEGACY_DATA_MARTS_ENDPOINT_TARGET_AUDIENCE: 'https://legacy.example.test',
          LEGACY_DATA_MARTS_ENDPOINT_BASE_URL: 'https://legacy.example.test',
        })[key],
    } as never);
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });
  it('never passes a create POST to the automatic backoff wrapper', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ambiguous timeout'));
    await expect(
      service.createDataMart({ title: 'Revenue', gcpProjectId: 'gcp', query: 'SELECT 1' })
    ).rejects.toThrow('ambiguous timeout');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(fetchWithBackoff).not.toHaveBeenCalled();
  });
  it('retains ordinary retry support for reads', async () => {
    (fetchWithBackoff as jest.Mock).mockResolvedValue({ ok: true, json: async () => ['known-id'] });
    expect(await service.getDataMartsList('gcp')).toEqual(['known-id']);
    expect(fetchWithBackoff).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('retains retry support for the read-only parse-query POST', async () => {
    (fetchWithBackoff as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ parsedQuery: 'SELECT 2', error: null }),
    });
    await expect(service.parseQuery('SELECT 1')).resolves.toBe('SELECT 2');
    expect(fetchWithBackoff).toHaveBeenCalledWith(
      'https://legacy.example.test/odm/parse-query',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ query: 'SELECT 1' }) })
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('does not expose arbitrary provider bodies on a failed create', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      body: { cancel: jest.fn() },
      text: async () => 'provider-secret',
    });
    const logger = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    await expect(
      service.createDataMart({ title: 'Revenue', gcpProjectId: 'gcp', query: 'SELECT 1' })
    ).rejects.toThrow('Legacy ODM API request failed with status 500');
    expect(logger).not.toHaveBeenCalledWith(expect.stringContaining('provider-secret'));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
