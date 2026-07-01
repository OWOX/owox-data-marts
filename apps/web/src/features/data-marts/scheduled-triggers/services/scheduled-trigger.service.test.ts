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

  it('fetches all project-wide scheduled triggers when pagination is omitted', async () => {
    const firstTrigger = { id: 'trigger-1' };
    const secondPageTrigger = { id: 'trigger-101' };
    (apiClient.get as any)
      .mockResolvedValueOnce({
        data: {
          triggers: Array.from({ length: 100 }, (_, index) => ({
            id: `trigger-${index + 1}`,
          })),
        },
      })
      .mockResolvedValueOnce({ data: { triggers: [secondPageTrigger] } });

    const result = await service.getProjectScheduledTriggers();

    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/data-marts/scheduled-triggers', {
      params: { limit: 100, offset: 0 },
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/data-marts/scheduled-triggers', {
      params: { limit: 100, offset: 100 },
    });
    expect(result.triggers).toHaveLength(101);
    expect(result.triggers[0]).toEqual(firstTrigger);
    expect(result.triggers[100]).toEqual(secondPageTrigger);
  });
});
