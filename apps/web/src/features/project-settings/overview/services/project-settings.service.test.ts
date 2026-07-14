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
    vi.mocked(apiClient.get).mockResolvedValue({ data: { description: 'Project context' } });

    await expect(service.getSettings()).resolves.toEqual({ description: 'Project context' });
    expect(apiClient.get).toHaveBeenCalledWith('/projects/settings', { params: undefined });
  });

  it('updates and clears the project description', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: { description: null } });

    await expect(service.updateDescription(null)).resolves.toEqual({ description: null });
    expect(apiClient.put).toHaveBeenCalledWith(
      '/projects/settings/description',
      { description: null },
      undefined
    );
  });
});
