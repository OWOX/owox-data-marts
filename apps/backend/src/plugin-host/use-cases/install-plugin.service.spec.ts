jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { NotFoundException } from '@nestjs/common';
import { AuthorizationContext } from '../../idp/types/auth.types';
import { InstallPluginCommand } from '../dto/domain/install-plugin.command';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginSuspendedError, StaleVersionConfirmationError } from '../errors/plugin-host.errors';
import { PluginAuditService } from '../services/plugin-audit.service';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginUpdateScheduleService } from '../services/plugin-update-schedule.service';
import { PluginService } from '../services/plugin.service';
import { InstallPluginService } from './install-plugin.service';
import { RunPluginUpdateCheckService } from './run-plugin-update-check.service';

const MEMBER = { projectId: 'j1', userId: 'u1' } as AuthorizationContext;

function setup(overrides: { plugin?: unknown; installation?: unknown; wasDormant?: boolean } = {}) {
  const pluginService = {
    // `in` rather than ??, so a test can override with an explicit null.
    findById: jest
      .fn()
      .mockResolvedValue(
        'plugin' in overrides
          ? overrides.plugin
          : { id: 'p1', currentVersionId: 'v1', suspendedAt: null }
      ),
  } as unknown as jest.Mocked<PluginService>;

  const versionService = {
    findById: jest.fn().mockResolvedValue({ id: 'v1', semver: '1.0.0' }),
  } as unknown as jest.Mocked<PluginVersionService>;

  const installations = {
    findOne: jest.fn().mockResolvedValue(overrides.installation ?? null),
    install: jest.fn().mockResolvedValue({
      id: 'i1',
      pluginId: 'p1',
      createdAt: new Date('2026-01-01'),
      installedAt: new Date('2026-01-01'),
      uninstalledAt: null,
    }),
    installOrFind: jest.fn().mockResolvedValue({
      installation: {
        id: 'i1',
        pluginId: 'p1',
        createdAt: new Date('2026-01-01'),
        installedAt: new Date('2026-01-01'),
        uninstalledAt: null,
      },
      wonRace: true,
    }),
    restore: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue({
      id: 'i1',
      pluginId: 'p1',
      createdAt: new Date('2026-01-01'),
      installedAt: new Date('2026-07-01'),
      uninstalledAt: null,
    }),
  } as unknown as jest.Mocked<PluginInstallationService>;

  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<PluginAuditService>;

  const schedule = {
    // Already on daily maintenance unless a test says otherwise.
    ensureScheduled: jest.fn().mockResolvedValue(overrides.wasDormant ?? false),
  } as unknown as jest.Mocked<PluginUpdateScheduleService>;

  const check = {
    run: jest.fn().mockResolvedValue({
      pluginId: 'p1',
      repository: 'OWOX/example',
      outcome: 'up_to_date',
      currentVersionId: 'v1',
      currentSemver: '1.0.0',
      report: null,
    }),
  } as unknown as jest.Mocked<RunPluginUpdateCheckService>;

  return {
    service: new InstallPluginService(
      pluginService,
      versionService,
      installations,
      audit,
      schedule,
      check
    ),
    pluginService,
    installations,
    audit,
    schedule,
    check,
  };
}

const install = (s: ReturnType<typeof setup>, expectedVersionId = 'v1') =>
  s.service.run(new InstallPluginCommand('p1', expectedVersionId, MEMBER));

describe('InstallPluginService', () => {
  it('creates an installation with both timestamps on the first install', async () => {
    const s = setup();

    const result = await install(s);

    expect(s.installations.installOrFind).toHaveBeenCalledWith('p1', 'j1', 'u1');
    expect(result.installedAt).toEqual(result.createdAt);
    expect(result.uninstalledAt).toBeNull();
  });

  /**
   * A double-click sends two firsts: both read no installation and both insert, and
   * UQ_plugin_installation refuses the second. Installing is documented as idempotent, so
   * the loser has to answer with the winner's row rather than a 500.
   */
  it('answers with the winner’s row when it loses the insert race', async () => {
    const s = setup();
    const winner = {
      id: 'i-winner',
      pluginId: 'p1',
      createdAt: new Date('2026-01-01'),
      installedAt: new Date('2026-01-01'),
      uninstalledAt: null,
    };
    (s.installations.installOrFind as jest.Mock).mockResolvedValue({
      installation: winner,
      wonRace: false,
    });

    const result = await install(s);

    expect(result.installationId).toBe('i-winner');
    expect(result.uninstalledAt).toBeNull();
  });

  // The winner already recorded INSTALL; a second one would double-count a first grant of
  // authority to a third party, which is exactly what that event is for.
  it('does not record a second INSTALL for the request that lost the race', async () => {
    const s = setup();
    (s.installations.installOrFind as jest.Mock).mockResolvedValue({
      installation: { id: 'i-winner', pluginId: 'p1', uninstalledAt: null },
      wonRace: false,
    });

    await install(s);

    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: PluginAuditAction.RESTORE })
    );
  });

  // createdAt means "first ever installation" and must survive any number of cycles,
  // otherwise the history a member restores from loses its origin.
  it('restores an existing record instead of creating a second one', async () => {
    const s = setup({
      installation: {
        id: 'i1',
        createdAt: new Date('2026-01-01'),
        uninstalledAt: new Date('2026-06-01'),
      },
    });

    const result = await install(s);

    expect(s.installations.install).not.toHaveBeenCalled();
    expect(s.installations.restore).toHaveBeenCalledWith('i1');
    expect(result.createdAt).toEqual(new Date('2026-01-01'));
    expect(result.uninstalledAt).toBeNull();
  });

  it('is idempotent when the member already has it installed', async () => {
    const s = setup({
      installation: { id: 'i1', createdAt: new Date('2026-01-01'), uninstalledAt: null },
    });

    await expect(install(s)).resolves.toMatchObject({ uninstalledAt: null });
    expect(s.installations.install).not.toHaveBeenCalled();
  });

  it('audits an install and a restore differently', async () => {
    const fresh = setup();
    await install(fresh);
    expect(fresh.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: PluginAuditAction.INSTALL })
    );

    const returning = setup({
      installation: { id: 'i1', createdAt: new Date('2026-01-01'), uninstalledAt: new Date() },
    });
    await install(returning);
    expect(returning.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: PluginAuditAction.RESTORE })
    );
  });

  describe('confirmation freshness', () => {
    // Any installed member can move the plugin forward at any moment, so what a member
    // read about can change between rendering and confirming.
    it('refuses a confirmation for a version that is no longer current', async () => {
      const s = setup();

      await expect(install(s, 'v-old')).rejects.toBeInstanceOf(StaleVersionConfirmationError);
      expect(s.installations.install).not.toHaveBeenCalled();
    });

    it('carries the new version back so the screen can re-render', async () => {
      const s = setup();

      await expect(install(s, 'v-old')).rejects.toMatchObject({
        errorDetails: { currentVersionId: 'v1', currentSemver: '1.0.0' },
      });
    });
  });

  describe('preconditions', () => {
    it('refuses to install a suspended plugin', async () => {
      const s = setup({ plugin: { id: 'p1', currentVersionId: 'v1', suspendedAt: new Date() } });

      await expect(install(s)).rejects.toBeInstanceOf(PluginSuspendedError);
    });

    it('refuses to restore a suspended plugin', async () => {
      const s = setup({
        plugin: { id: 'p1', currentVersionId: 'v1', suspendedAt: new Date() },
        installation: { id: 'i1', createdAt: new Date(), uninstalledAt: new Date() },
      });

      await expect(install(s)).rejects.toBeInstanceOf(PluginSuspendedError);
    });

    it('refuses a plugin that does not exist', async () => {
      const s = setup({ plugin: null });

      await expect(install(s)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a plugin with no eligible version to install', async () => {
      const s = setup({ plugin: { id: 'p1', currentVersionId: null, suspendedAt: null } });

      await expect(s.service.run(new InstallPluginCommand('p1', null, MEMBER))).rejects.toThrow();
    });
  });

  /**
   * A plugin nothing publishes and nobody has installed is off daily maintenance, so
   * what OWOX recorded about it may be months old. Installing is the moment to find out,
   * and it puts the plugin back on the schedule.
   */
  describe('freshness of a dormant plugin', () => {
    it('checks it for a newer release before installing', async () => {
      const s = setup({ wasDormant: true });

      await install(s);

      expect(s.check.run).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), 'automatic');
    });

    it('spends no GitHub call on a plugin already under maintenance', async () => {
      const s = setup();

      await install(s);

      expect(s.schedule.ensureScheduled).toHaveBeenCalledWith('p1');
      expect(s.check.run).not.toHaveBeenCalled();
    });
  });

  // Installing from a direct link must not quietly add the plugin to anyone's Gallery.
  it('never creates a publication', async () => {
    const s = setup();

    await install(s);

    expect(Object.keys(s)).not.toContain('publications');
  });
});
