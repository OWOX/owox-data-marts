import { Logger } from '@nestjs/common';
import { ReleaseRejectionDto } from '../dto/domain/plugin-sync.dto';
import { Plugin } from '../entities/plugin.entity';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';
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

function setup(
  options: {
    syncedTo?: string | null;
    throttled?: boolean;
    rejections?: ReleaseRejectionDto[];
  } = {}
) {
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
        rejections: options.rejections ?? [],
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

  describe('rejection visibility', () => {
    const incompatible: ReleaseRejectionDto = {
      tagName: 'v0.1.2',
      githubReleaseId: 'r2',
      code: ReleaseRejectionCode.COLLECTIONS_INCOMPATIBLE,
      detail: 'Collection "dashboards" cannot change entity binding',
    };
    const draft: ReleaseRejectionDto = {
      tagName: 'v0.2.0',
      githubReleaseId: 'r3',
      code: ReleaseRejectionCode.DRAFT,
      detail: 'Release is a draft',
    };

    let warn: jest.SpyInstance;

    beforeEach(() => {
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      warn.mockRestore();
    });

    it('logs a publisher-fixable rejection so an operator can find it', async () => {
      const s = setup({ syncedTo: 'v1', rejections: [incompatible] });

      await s.service.run(PLUGIN, 'automatic');

      expect(warn).toHaveBeenCalledWith(
        'OWOX/example: v0.1.2 rejected (COLLECTIONS_INCOMPATIBLE) — Collection "dashboards" cannot change entity binding'
      );
    });

    // Drafts and prereleases are ineligible by design and permanently; logging them
    // daily would bury the one line that matters.
    it('stays silent about by-design rejections', async () => {
      const s = setup({ syncedTo: 'v1', rejections: [draft] });

      await s.service.run(PLUGIN, 'automatic');

      expect(warn).not.toHaveBeenCalled();
      expect(s.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          afterState: expect.not.objectContaining({ rejections: expect.anything() }),
        })
      );
    });

    it('records publisher-fixable rejections in the audit trail, not only thrown errors', async () => {
      const s = setup({ syncedTo: 'v1', rejections: [draft, incompatible] });

      await s.service.run(PLUGIN, 'member', { projectId: 'j1', userId: 'u1' });

      expect(s.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: PluginAuditAction.UPDATE_CHECK,
          afterState: expect.objectContaining({
            outcome: 'up_to_date',
            rejections: [incompatible],
          }),
        })
      );
    });

    // A throttled check hands back the stored report of an earlier run; repeating its
    // rejections would multiply the same line without a new check behind it.
    it('does not repeat rejections from a stale throttled report', async () => {
      const s = setup({ syncedTo: 'v1', throttled: true, rejections: [incompatible] });

      await s.service.run(PLUGIN, 'member');

      expect(warn).not.toHaveBeenCalled();
      expect(s.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          afterState: expect.not.objectContaining({ rejections: expect.anything() }),
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
