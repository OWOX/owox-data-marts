import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../../../../../app/api/apiClient.ts';
import { InsightTemplatesService } from './insight-templates.service.ts';

vi.mock('../../../../../../app/api/apiClient.ts', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('InsightTemplatesService', () => {
  let service: InsightTemplatesService;

  beforeEach(() => {
    service = new InsightTemplatesService();

    vi.resetAllMocks();
    (apiClient.get as any).mockResolvedValue({ data: {} });
    (apiClient.post as any).mockResolvedValue({ data: {} });
    (apiClient.put as any).mockResolvedValue({ data: {} });
    (apiClient.patch as any).mockResolvedValue({ data: {} });
    (apiClient.delete as any).mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('posts manual run trigger payload', async () => {
    (apiClient.post as any).mockResolvedValueOnce({ data: { triggerId: 'trigger-1' } });

    const result = await service.startInsightTemplateExecution('data-mart-1', 'template-1', {
      type: 'manual',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/data-marts/data-mart-1/insight-templates/template-1/run-triggers',
      { type: 'manual' },
      undefined
    );
    expect(result).toEqual({ triggerId: 'trigger-1' });
  });

  it('posts chat run trigger payload', async () => {
    (apiClient.post as any).mockResolvedValueOnce({ data: { triggerId: 'trigger-2' } });

    const result = await service.startInsightTemplateExecution('data-mart-1', 'template-1', {
      type: 'chat',
      assistantMessageId: '57bba70a-8ad8-4edc-8b3e-ec45f51dc486',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/data-marts/data-mart-1/insight-templates/template-1/run-triggers',
      {
        type: 'chat',
        assistantMessageId: '57bba70a-8ad8-4edc-8b3e-ec45f51dc486',
      },
      undefined
    );
    expect(result).toEqual({ triggerId: 'trigger-2' });
  });

  it('fetches paginated project-wide insight templates', async () => {
    const response = { insights: [] };
    (apiClient.get as any).mockResolvedValueOnce({ data: response });

    const result = await service.getProjectInsightTemplates(100, 200);

    expect(apiClient.get).toHaveBeenCalledWith('/data-marts/insight-templates', {
      params: { limit: 100, offset: 200 },
    });
    expect(result).toEqual(response);
  });

  it('fetches all project-wide insight templates when pagination is omitted', async () => {
    const firstInsight = { id: 'insight-1', title: 'Insight 1' };
    const secondInsight = { id: 'insight-101', title: 'Insight 101' };
    (apiClient.get as any)
      .mockResolvedValueOnce({
        data: {
          insights: Array.from({ length: 100 }, (_, index) => ({
            id: `insight-${index + 1}`,
            title: `Insight ${index + 1}`,
          })),
        },
      })
      .mockResolvedValueOnce({ data: { insights: [secondInsight] } });

    const result = await service.getProjectInsightTemplates();

    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/data-marts/insight-templates', {
      params: { limit: 100, offset: 0 },
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/data-marts/insight-templates', {
      params: { limit: 100, offset: 100 },
    });
    expect(result.insights).toHaveLength(101);
    expect(result.insights[0]).toEqual(firstInsight);
    expect(result.insights[100]).toEqual(secondInsight);
  });
});
