import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../../../app/api/apiClient';
import { ProjectSettingsApiService } from './project-settings.service';

vi.mock('../../../../app/api/apiClient', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

describe('ProjectSettingsApiService', () => {
  const service = new ProjectSettingsApiService();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads settings for the authenticated project', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { description: 'Project context', revision: 3 },
    });

    await expect(service.getSettings()).resolves.toEqual({
      description: 'Project context',
      revision: 3,
    });
    expect(apiClient.get).toHaveBeenCalledWith('/projects/settings', { params: undefined });
  });

  it('updates and clears the project description', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: { description: null, revision: 4 } });

    await expect(service.updateDescription(null, 3)).resolves.toEqual({
      description: null,
      revision: 4,
    });
    expect(apiClient.put).toHaveBeenCalledWith(
      '/projects/settings/description',
      { description: null, expectedRevision: 3 },
      undefined
    );
  });
});
