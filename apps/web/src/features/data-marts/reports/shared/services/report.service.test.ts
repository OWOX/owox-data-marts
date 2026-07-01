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

  it('fetches all project reports when pagination is omitted', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: `report-${index + 1}` }));
    const secondPage = [{ id: 'report-101' }];
    (apiClient.get as any)
      .mockResolvedValueOnce({ data: firstPage })
      .mockResolvedValueOnce({ data: secondPage });

    const result = await service.getReportsByProject();

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/reports/', {
      params: { limit: 100, offset: 0 },
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/reports/', {
      params: { limit: 100, offset: 100 },
    });
    expect(result).toEqual([...firstPage, ...secondPage]);
  });

  it('fetches project reports with limit-only pagination', async () => {
    await service.getReportsByProject(100);

    expect(apiClient.get).toHaveBeenCalledWith('/reports/', {
      params: { limit: 100 },
    });
  });

  it('fetches paginated project reports', async () => {
    await service.getReportsByProject(100, 200);

    expect(apiClient.get).toHaveBeenCalledWith('/reports/', {
      params: { limit: 100, offset: 200 },
    });
  });

  it('fetches project reports with offset-only pagination', async () => {
    await service.getReportsByProject(undefined, 200);

    expect(apiClient.get).toHaveBeenCalledWith('/reports/', {
      params: { limit: 100, offset: 200 },
    });
  });
});
