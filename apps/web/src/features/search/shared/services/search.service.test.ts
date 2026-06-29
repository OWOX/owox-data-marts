import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../../../app/api/apiClient';
import { SearchService } from './search.service';

vi.mock('../../../../app/api/apiClient', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(() => {
    service = new SearchService();
    vi.resetAllMocks();
    (apiClient.get as any).mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('serializes search options to the top-level /search endpoint', async () => {
    await service.search('sales', {
      limit: 12,
      entityTypes: ['DATA_MART', 'DATA_STORAGE'],
      excludeDrafts: true,
      config: { timeout: 1234 },
    });

    expect(apiClient.get).toHaveBeenCalledWith('/search', {
      params: {
        q: 'sales',
        limit: 12,
        entityTypes: 'DATA_MART,DATA_STORAGE',
        excludeDrafts: true,
      },
      timeout: 1234,
      skipLoadingIndicator: true,
      skipErrorToast: true,
    });
  });
});
