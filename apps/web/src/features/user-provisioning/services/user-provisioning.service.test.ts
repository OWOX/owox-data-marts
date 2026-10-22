import { afterEach, describe, expect, it, vi } from 'vitest';
import { userProvisioningService } from './user-provisioning.service';

describe('user provisioning project creation', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['claude', 'chatgpt'] as const)(
    'sends %s attribution to the existing project creation API',
    async integration => {
      const result = { projectId: 'new-project', projectTitle: 'New project' };
      const post = vi.spyOn(userProvisioningService, 'post').mockResolvedValueOnce(result);
      await expect(userProvisioningService.createNewProject(integration)).resolves.toBe(result);
      expect(post).toHaveBeenCalledWith('/create-new-project', { integration });
    }
  );

  it('keeps an ordinary project creation request backward compatible', async () => {
    const post = vi.spyOn(userProvisioningService, 'post').mockResolvedValueOnce({});
    await userProvisioningService.createNewProject();
    expect(post).toHaveBeenCalledWith('/create-new-project', undefined);
  });
});
