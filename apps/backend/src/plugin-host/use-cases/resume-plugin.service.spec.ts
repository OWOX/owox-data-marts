jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { AuthorizationContext } from '../../idp/types/auth.types';
import { ResumePluginCommand } from '../dto/domain/suspend-plugin.command';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import {
  PluginNotPublishedError,
  PublicationAuthorizationError,
} from '../errors/plugin-host.errors';
import { PluginAuditService } from '../services/plugin-audit.service';
import { PluginService } from '../services/plugin.service';
import { PublicationAuthorizationService } from '../services/publication-authorization.service';
import { ResumePluginService } from './resume-plugin.service';

const PUBLISHER = { projectId: 'j1', userId: 'u1', apiKeyId: 'key-1' } as AuthorizationContext;

function setup(suspendedAt: Date | null = new Date('2026-07-01')) {
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
    service: new ResumePluginService(authorization, pluginService, audit),
    authorization,
    pluginService,
    audit,
  };
}

const resume = (s: ReturnType<typeof setup>, note?: string) =>
  s.service.run(new ResumePluginCommand('OWOX/example-plugin', PUBLISHER, note));

describe('ResumePluginService', () => {
  describe('authority', () => {
    it('is limited to allowlisted deployment publisher keys', async () => {
      const s = setup();
      s.authorization.isDeploymentPublisher.mockReturnValue(false);

      await expect(resume(s)).rejects.toBeInstanceOf(PublicationAuthorizationError);
      expect(s.pluginService.setSuspension).not.toHaveBeenCalled();
    });
  });

  it('reports a repository this deployment has never seen', async () => {
    const s = setup();
    s.pluginService.findByRepoName.mockResolvedValue(null);

    await expect(resume(s)).rejects.toBeInstanceOf(PluginNotPublishedError);
  });

  it('clears the suspension and its note', async () => {
    const s = setup();

    const result = await resume(s, 'vendor fixed it');

    expect(s.pluginService.setSuspension).toHaveBeenCalledWith('p1', null, null, 'vendor fixed it');
    expect(result.suspended).toBe(false);
  });

  it('is idempotent on a plugin that is not suspended', async () => {
    const s = setup(null);

    const result = await resume(s);

    expect(result.suspended).toBe(false);
    expect(s.pluginService.setSuspension).not.toHaveBeenCalled();
    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: PluginAuditAction.RESUME })
    );
  });

  // Updates stay available while suspended, so the current version may well have moved
  // on. Resume re-enables whatever is current now rather than the version that was
  // current when it was suspended.
  it('re-enables on the version that is current now, not the one at suspension time', async () => {
    const s = setup(new Date('2026-07-01'));
    s.pluginService.findByRepoName.mockResolvedValue({
      id: 'p1',
      suspendedAt: new Date('2026-07-01'),
      currentVersionId: 'v-newer',
    } as never);

    await resume(s);

    // Nothing pins a version: clearing suspendedAt is the whole re-enable, so a
    // version discovered during suspension simply takes effect.
    expect(s.pluginService.setSuspension).toHaveBeenCalledWith('p1', null, null, null);
  });
});
