import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../../../app/api/apiClient.ts';
import { ScheduledTriggerService } from './scheduled-trigger.service.ts';

vi.mock('../../../../app/api/apiClient.ts', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('ScheduledTriggerService', () => {
  let service: ScheduledTriggerService;

  beforeEach(() => {
    service = new ScheduledTriggerService();
    vi.resetAllMocks();
    (apiClient.get as any).mockResolvedValue({ data: {} });
  });

  it('fetches project-wide scheduled triggers', async () => {
    const response = { triggers: [] };
    (apiClient.get as any).mockResolvedValueOnce({ data: response });

    const result = await service.getProjectScheduledTriggers(20, 40);

    expect(apiClient.get).toHaveBeenCalledWith('/data-marts/scheduled-triggers', {
      params: { limit: 20, offset: 40 },
    });
    expect(result).toEqual(response);
  });
});
