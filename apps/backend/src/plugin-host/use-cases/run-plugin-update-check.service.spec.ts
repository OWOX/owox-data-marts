import { Plugin } from '../entities/plugin.entity';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginAuditService } from '../services/plugin-audit.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { RunPluginUpdateCheckService } from './run-plugin-update-check.service';
import { SyncPluginReleasesService } from './sync-plugin-releases.service';

const PLUGIN = {
  id: 'p1',
  repoOwner: 'OWOX',
  repoName: 'example',
  currentVersionId: 'v1',
} as Plugin;

function setup(options: { syncedTo?: string | null; throttled?: boolean } = {}) {
  const sync = {
    run: jest.fn().mockResolvedValue({
      pluginId: 'p1',
      repository: 'OWOX/example',
      currentVersionId: options.syncedTo === undefined ? 'v2' : options.syncedTo,
      currentSemver: options.syncedTo === 'v1' ? '1.0.0' : '2.0.0',
      throttled: options.throttled ?? false,
      report: {
        syncedAt: '2026-07-01T00:00:00.000Z',
        accessMode: 'anonymous',
        acceptedSemvers: [],
        unchangedSemvers: [],
        rejections: [],
      },
    }),
  } as unknown as jest.Mocked<SyncPluginReleasesService>;

  const versionService = {
    findById: jest.fn().mockResolvedValue({ id: 'v1', semver: '1.0.0' }),
  } as unknown as jest.Mocked<PluginVersionService>;

  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<PluginAuditService>;

  return {
    service: new RunPluginUpdateCheckService(sync, versionService, audit),
    sync,
    audit,
  };
}

describe('RunPluginUpdateCheckService', () => {
  describe('outcomes', () => {
    it('reports an activation when the current version moved', async () => {
      await expect(setup().service.run(PLUGIN, 'automatic')).resolves.toMatchObject({
        outcome: 'updated',
        currentSemver: '2.0.0',
      });
    });

    it('reports no change as a normal outcome', async () => {
      await expect(
        setup({ syncedTo: 'v1' }).service.run(PLUGIN, 'automatic')
      ).resolves.toMatchObject({ outcome: 'up_to_date' });
    });

    it('reports a throttled run as a check already in progress', async () => {
      await expect(
        setup({ syncedTo: 'v1', throttled: true }).service.run(PLUGIN, 'member')
      ).resolves.toMatchObject({ outcome: 'already_running' });
    });

    /**
     * An unreachable GitHub is an outcome, not a broken request: the member is told the
     * current version stays active and the deployment will try again on its own.
     */
    it('keeps the current version when the check cannot reach GitHub', async () => {
      const s = setup();
      s.sync.run.mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.github.com'));

      await expect(s.service.run(PLUGIN, 'automatic')).resolves.toMatchObject({
        outcome: 'failed',
        currentVersionId: 'v1',
        currentSemver: '1.0.0',
      });
    });
  });

  describe('audit', () => {
    it('records an activation as an update by the deployment', async () => {
      const s = setup();

      await s.service.run(PLUGIN, 'automatic');

      expect(s.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: PluginAuditAction.UPDATE,
          authorityScope: PluginPublicationScope.DEPLOYMENT,
          userId: null,
          beforeState: { currentVersionId: 'v1' },
          afterState: expect.objectContaining({
            currentVersionId: 'v2',
            trigger: 'automatic',
            outcome: 'updated',
          }),
        })
      );
    });

    it('records who asked for a member-requested check', async () => {
      const s = setup({ syncedTo: 'v1' });

      await s.service.run(PLUGIN, 'member', { projectId: 'j1', userId: 'u1' });

      expect(s.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: PluginAuditAction.UPDATE_CHECK,
          authorityScope: PluginPublicationScope.MEMBER,
          userId: 'u1',
          afterState: expect.objectContaining({ trigger: 'member', outcome: 'up_to_date' }),
        })
      );
    });

    // Telling a silent day apart from a broken one is the whole point of auditing
    // maintenance nobody asked for.
    it('records why a check failed', async () => {
      const s = setup();
      s.sync.run.mockRejectedValue(new Error('GitHub responded 403'));

      await s.service.run(PLUGIN, 'automatic');

      expect(s.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: PluginAuditAction.UPDATE_CHECK,
          afterState: expect.objectContaining({
            outcome: 'failed',
            failureDetail: 'GitHub responded 403',
          }),
        })
      );
    });
  });

  // A suspended plugin is exactly the one that needs a corrective version to become
  // current; activation does not resume it.
  it('checks a suspended plugin like any other', async () => {
    const s = setup();

    await s.service.run({ ...PLUGIN, suspendedAt: new Date() } as Plugin, 'automatic');

    expect(s.sync.run).toHaveBeenCalledWith(
      expect.objectContaining({ repoLocator: 'OWOX/example', requireCurrentVersion: false })
    );
  });
});
