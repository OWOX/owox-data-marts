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

  it('fetches project reports without pagination when no pagination parameters are provided', async () => {
    await service.getReportsByProject();

    expect(apiClient.get).toHaveBeenCalledWith('/reports/', { params: undefined });
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
      params: { offset: 200 },
    });
  });
});
