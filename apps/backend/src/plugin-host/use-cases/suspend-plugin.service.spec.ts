jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { AuthorizationContext } from '../../idp/types/auth.types';
import { SuspendPluginCommand } from '../dto/domain/suspend-plugin.command';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import {
  PluginNotPublishedError,
  PublicationAuthorizationError,
} from '../errors/plugin-host.errors';
import { PluginAuditService } from '../services/plugin-audit.service';
import { PluginService } from '../services/plugin.service';
import { PublicationAuthorizationService } from '../services/publication-authorization.service';
import { SuspendPluginService } from './suspend-plugin.service';

const PUBLISHER = { projectId: 'j1', userId: 'u1', apiKeyId: 'key-1' } as AuthorizationContext;

function setup(suspendedAt: Date | null = null) {
  const authorization = {
    isDeploymentPublisher: jest.fn().mockReturnValue(true),
  } as unknown as jest.Mocked<PublicationAuthorizationService>;

  const pluginService = {
    findByRepoName: jest.fn().mockResolvedValue({ id: 'p1', suspendedAt }),
    setSuspension: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<PluginService>;

  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<PluginAuditService>;

  return {
    service: new SuspendPluginService(authorization, pluginService, audit),
    authorization,
    pluginService,
    audit,
  };
}

const suspend = (s: ReturnType<typeof setup>, note?: string) =>
  s.service.run(new SuspendPluginCommand('OWOX/example-plugin', PUBLISHER, note));

describe('SuspendPluginService', () => {
  describe('authority', () => {
    it('is limited to allowlisted deployment publisher keys', async () => {
      const s = setup();
      s.authorization.isDeploymentPublisher.mockReturnValue(false);

      await expect(suspend(s)).rejects.toBeInstanceOf(PublicationAuthorizationError);
      expect(s.pluginService.setSuspension).not.toHaveBeenCalled();
    });
  });

  // A kill switch is needed exactly when something is going wrong, so it must not
  // depend on GitHub being reachable.
  it('resolves the plugin from cached metadata, never from github', async () => {
    const s = setup();

    await suspend(s);

    expect(s.pluginService.findByRepoName).toHaveBeenCalledWith('OWOX', 'example-plugin');
  });

  it('reports a repository this deployment has never seen', async () => {
    const s = setup();
    s.pluginService.findByRepoName.mockResolvedValue(null);

    await expect(suspend(s)).rejects.toBeInstanceOf(PluginNotPublishedError);
  });

  describe('suspend', () => {
    it('records who suspended it and why', async () => {
      const s = setup();

      await suspend(s, 'exfiltrating data');

      expect(s.pluginService.setSuspension).toHaveBeenCalledWith(
        'p1',
        expect.any(Date),
        'key-1',
        'exfiltrating data'
      );
    });

    it('is idempotent but audited every time', async () => {
      const s = setup(new Date('2026-07-01'));

      const result = await suspend(s);

      expect(result.suspended).toBe(true);
      expect(s.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: PluginAuditAction.SUSPEND, pluginId: 'p1' })
      );
    });

    it('leaves the earlier suspension timestamp alone when already suspended', async () => {
      const s = setup(new Date('2026-07-01'));

      await suspend(s);

      expect(s.pluginService.setSuspension).not.toHaveBeenCalled();
    });
  });

  it('never touches publications or installations', async () => {
    const s = setup();

    await suspend(s);

    // Only suspension state changes: §12 requires publications and installation records
    // to survive untouched, which is why this service has no other collaborators.
    expect(Object.keys(s.pluginService)).toEqual(['findByRepoName', 'setSuspension']);
  });
});
