import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../../app/api/apiClient';
import { pluginsService } from './plugins.service';

vi.mock('../../../app/api/apiClient', () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));

describe('PluginsService.install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { installationId: 'installation-1' } });
  });

  it('omits empty Credential selections for compatibility with the previous backend', async () => {
    await pluginsService.install('plugin-1', 'version-1', {});

    expect(apiClient.post).toHaveBeenCalledWith(
      '/plugins/plugin-1/installation',
      {
        expectedVersionId: 'version-1',
      },
      undefined
    );
  });

  it('sends explicit Credential decisions when the plugin declares requirements', async () => {
    await pluginsService.install('plugin-1', 'version-1', { github: null });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/plugins/plugin-1/installation',
      {
        expectedVersionId: 'version-1',
        credentialSelections: { github: null },
      },
      undefined
    );
  });
});

describe('PluginsService.lookupByRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { pluginId: 'p1' } });
  });

  it("skips the global error toast, so a failed lookup shows only the page's own message", async () => {
    await pluginsService.lookupByRepository('OWOX/odm-usage-stat');

    expect(apiClient.get).toHaveBeenCalledWith('/plugins/lookup', {
      params: { repository: 'OWOX/odm-usage-stat' },
      skipErrorToast: true,
    });
  });
});
