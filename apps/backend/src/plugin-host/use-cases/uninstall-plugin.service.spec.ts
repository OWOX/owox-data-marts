jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { NotFoundException } from '@nestjs/common';
import { UninstallPluginCommand } from '../dto/domain/uninstall-plugin.command';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import type { PluginAuditService } from '../services/plugin-audit.service';
import type { PluginInstallationService } from '../services/plugin-installation.service';
import { UninstallPluginService } from './uninstall-plugin.service';

function setup(installation: { id: string; uninstalledAt: Date | null } | null) {
  const installations = {
    findOne: jest.fn().mockResolvedValue(installation),
    uninstall: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const bindings = { deactivateConsumer: jest.fn().mockResolvedValue(undefined) };
  const service = new UninstallPluginService(
    installations as unknown as PluginInstallationService,
    audit as unknown as PluginAuditService,
    bindings as never
  );
  const run = () =>
    service.run(new UninstallPluginCommand('p1', { projectId: 'j1', userId: 'u1' } as never));
  return { run, installations, audit };
}

describe('UninstallPluginService', () => {
  it('records that the installation was active before a real uninstall', async () => {
    const s = setup({ id: 'i1', uninstalledAt: null });

    await s.run();

    expect(s.installations.uninstall).toHaveBeenCalledWith('i1');
    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: PluginAuditAction.UNINSTALL,
        beforeState: { uninstalled: false },
      })
    );
  });

  it('records that the installation was already removed on a repeat uninstall', async () => {
    const s = setup({ id: 'i1', uninstalledAt: new Date() });

    await s.run();

    expect(s.installations.uninstall).not.toHaveBeenCalled();
    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ beforeState: { uninstalled: true } })
    );
  });

  it('rejects a plugin the member never installed', async () => {
    await expect(setup(null).run()).rejects.toBeInstanceOf(NotFoundException);
  });
});
