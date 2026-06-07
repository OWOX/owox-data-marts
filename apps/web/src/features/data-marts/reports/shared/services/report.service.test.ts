import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../../../../app/api/apiClient.ts';
import { ReportService } from './report.service.ts';

vi.mock('../../../../../app/api/apiClient.ts', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('ReportService', () => {
  let service: ReportService;

  beforeEach(() => {
    service = new ReportService();
    vi.resetAllMocks();
    (apiClient.get as any).mockResolvedValue({ data: [] });
  });

  it('fetches project reports without pagination when no limit is provided', async () => {
    await service.getReportsByProject();

    expect(apiClient.get).toHaveBeenCalledWith('/reports/', { params: undefined });
  });

  it('fetches paginated project reports', async () => {
    await service.getReportsByProject(100, 200);

    expect(apiClient.get).toHaveBeenCalledWith('/reports/', {
      params: { limit: 100, offset: 200 },
    });
  });
});
