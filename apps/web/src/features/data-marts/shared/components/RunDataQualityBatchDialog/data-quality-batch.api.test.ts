import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../../../../app/api/apiClient';
import { dataQualityBatchApi } from './data-quality-batch.api';

vi.mock('../../../../../app/api/apiClient', () => ({
  default: { post: vi.fn() },
}));

describe('Data Quality batch API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('posts the selected Data Mart ids to the static batch endpoint', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { items: [{ dataMartId: 'mart-1', status: 'SUCCESS', runId: 'run-1' }] },
    });

    await expect(dataQualityBatchApi.run(['mart-1'])).resolves.toEqual({
      items: [{ dataMartId: 'mart-1', status: 'SUCCESS', runId: 'run-1' }],
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/data-marts/data-quality/runs/batch',
      {
        dataMartIds: ['mart-1'],
      },
      undefined
    );
  });
});
