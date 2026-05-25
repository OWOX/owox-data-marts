import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../../app/api/apiClient';
import { projectMembersService } from './project-members.service';

vi.mock('../../../app/api/apiClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('projectMembersService user provisioning settings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('fetches user provisioning settings from the members API', async () => {
    const response = {
      isApplicable: true,
      organization: {
        name: 'owox.com',
        mainProjectId: 'main-project',
        mainProjectTitle: 'Main Project',
      },
      settings: {
        mode: 'automatic',
        defaultRole: 'viewer',
        roleScope: 'entire_project',
        contextIds: [],
      },
    };
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: response });

    await expect(projectMembersService.getUserProvisioningSettings()).resolves.toEqual(response);

    expect(apiClient.get).toHaveBeenCalledWith('/members/user-provisioning-settings', {
      params: undefined,
    });
  });

  it('updates user provisioning settings through the members API', async () => {
    const payload = {
      mode: 'manual' as const,
      defaultRole: 'editor' as const,
      roleScope: 'selected_contexts' as const,
      contextIds: ['ctx-1'],
    };
    const response = {
      isApplicable: true,
      organization: {
        name: 'owox.com',
        mainProjectId: 'main-project',
        mainProjectTitle: 'Main Project',
      },
      settings: payload,
    };
    vi.mocked(apiClient.put).mockResolvedValueOnce({ data: response });

    await expect(projectMembersService.updateUserProvisioningSettings(payload)).resolves.toEqual(
      response
    );

    expect(apiClient.put).toHaveBeenCalledWith(
      '/members/user-provisioning-settings',
      payload,
      undefined
    );
  });
});
