import { NotFoundException } from '@nestjs/common';
import { AuthorizationContext } from '../../idp/types/auth.types';
import { UpdatePluginCommand } from '../dto/domain/update-plugin.command';
import { PluginUpdateScheduleService } from '../services/plugin-update-schedule.service';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginPublicationService } from '../services/plugin-publication.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';
import { PublicationAuthorizationService } from '../services/publication-authorization.service';
import {
  PluginUpdateCheckOutcome,
  RunPluginUpdateCheckService,
} from './run-plugin-update-check.service';
import { UpdatePluginService } from './update-plugin.service';

const MEMBER = { projectId: 'j1', userId: 'u1' } as AuthorizationContext;
const PUBLISHER = { projectId: 'j1', userId: 'u1', apiKeyId: 'key-1' } as AuthorizationContext;

const NEXT_CHECK = new Date('2026-08-04T03:15:00.000Z');

function setup(
  options: { plugin?: unknown; outcome?: PluginUpdateCheckOutcome; wasScheduled?: boolean } = {}
) {
  const plugin = {
    id: 'p1',
    repoOwner: 'OWOX',
    repoName: 'example',
    suspendedAt: null,
    currentVersionId: 'v1',
    lastSyncReport: null,
    nextUpdateCheckAt: NEXT_CHECK,
  };

  const pluginService = {
    findById: jest.fn().mockResolvedValue('plugin' in options ? options.plugin : plugin),
    findByRepoName: jest.fn().mockResolvedValue('plugin' in options ? options.plugin : plugin),
  } as unknown as jest.Mocked<PluginService>;

  const authorization = {
    isDeploymentPublisher: jest.fn().mockReturnValue(false),
  } as unknown as jest.Mocked<PublicationAuthorizationService>;

  const schedule = {
    ensureScheduled: jest.fn().mockResolvedValue(options.wasScheduled ?? false),
  } as unknown as jest.Mocked<PluginUpdateScheduleService>;

  const outcome = options.outcome ?? 'updated';
  const check = {
    run: jest.fn().mockResolvedValue({
      pluginId: 'p1',
      repository: 'OWOX/example',
      outcome,
      currentVersionId: outcome === 'updated' ? 'v2' : 'v1',
      currentSemver: outcome === 'updated' ? '2.0.0' : '1.0.0',
      report: {
        syncedAt: '2026-07-01T00:00:00.000Z',
        accessMode: 'anonymous',
        acceptedSemvers: outcome === 'updated' ? ['2.0.0'] : [],
        unchangedSemvers: [],
        rejections: [],
      },
    }),
  } as unknown as jest.Mocked<RunPluginUpdateCheckService>;

  const versionService = {
    findById: jest.fn().mockResolvedValue({
      id: 'v2',
      semver: '2.0.0',
      deliveryUrl: 'https://plugin.example.com',
      commitSha: 'def',
    }),
  } as unknown as jest.Mocked<PluginVersionService>;

  const publications = {
    findVisibleTo: jest.fn().mockResolvedValue([{ pluginId: 'p1' }]),
    listManageable: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<PluginPublicationService>;

  const installations = {
    findOne: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<PluginInstallationService>;

  return {
    service: new UpdatePluginService(
      pluginService,
      authorization,
      schedule,
      check,
      versionService,
      publications,
      installations
    ),
    pluginService,
    authorization,
    schedule,
    check,
    publications,
    installations,
  };
}

const update = (s: ReturnType<typeof setup>, context = MEMBER) =>
  s.service.run(new UpdatePluginCommand(context, 'p1'));

describe('UpdatePluginService', () => {
  describe('who may ask', () => {
    /**
     * Any member who can reach the plugin page, per the managed-updates design. An
     * installation requirement would only delay a check that is scheduled and inevitable
     * anyway, for a plugin the member is standing in front of.
     */
    it('admits a member with no installation of their own', async () => {
      const s = setup();

      await expect(update(s)).resolves.toMatchObject({ outcome: 'updated' });
      expect(s.check.run).toHaveBeenCalled();
    });

    it('refuses a plugin that does not exist', async () => {
      await expect(update(setup({ plugin: null }))).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('what it reports', () => {
    it.each([
      ['updated', true],
      ['up_to_date', false],
      ['already_running', false],
      ['failed', false],
    ] as const)('carries the %s outcome through', async (outcome, updated) => {
      await expect(update(setup({ outcome }))).resolves.toMatchObject({ outcome, updated });
    });

    // The member is told when the deployment will do this on its own, which is what makes
    // Check now an acceleration rather than the only way a plugin ever moves.
    it('answers with the plugin’s own next automatic check', async () => {
      await expect(update(setup())).resolves.toMatchObject({
        nextCheckAt: NEXT_CHECK.toISOString(),
      });
    });

    it('asks for the check as a member, naming who asked', async () => {
      const s = setup();

      await update(s, PUBLISHER);

      expect(s.check.run).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), 'member', {
        projectId: 'j1',
        userId: 'u1',
        apiKeyId: 'key-1',
      });
    });

    it('is safe to repeat', async () => {
      const s = setup({ outcome: 'up_to_date' });

      await update(s);
      await update(s);

      expect((await update(s)).currentVersionId).toBe('v1');
    });
  });

  // A plugin nothing publishes or installs is off maintenance; being asked about is a
  // reason to put it back on the daily schedule.
  it('puts a dormant plugin back on the schedule', async () => {
    const s = setup({ wasScheduled: true });

    await update(s);

    expect(s.schedule.ensureScheduled).toHaveBeenCalledWith('p1');
  });

  // §6.2 keeps detailed validation failures to publisher-management operations, and
  // this endpoint answers ordinary members without diagnostics.
  it('never returns diagnostics to an ordinary member', async () => {
    const result = await update(setup());

    expect(result.diagnostics).toBeNull();
    expect(result.repository).toBe('OWOX/example');
  });

  it('returns diagnostics to an allowlisted publisher', async () => {
    const s = setup();
    s.authorization.isDeploymentPublisher.mockReturnValue(true);

    const result = await update(s, PUBLISHER);

    expect(result.diagnostics).toMatchObject({
      deliveryUrl: 'https://plugin.example.com',
      acceptedSemvers: ['2.0.0'],
    });
  });

  // GET /publications already hands this same block to whoever manages a publication of
  // the plugin; without it here, that publisher's Check now reads "up to date" while
  // their release was just rejected.
  it('returns diagnostics to a member who manages a publication of this plugin', async () => {
    const s = setup();
    s.publications.listManageable.mockResolvedValue([{ pluginId: 'p1' }] as never);

    const result = await update(s);

    expect(result.diagnostics).toMatchObject({ acceptedSemvers: ['2.0.0'] });
  });

  it('returns no diagnostics for a publication of a different plugin', async () => {
    const s = setup();
    s.publications.listManageable.mockResolvedValue([{ pluginId: 'other' }] as never);

    const result = await update(s);

    expect(result.diagnostics).toBeNull();
  });

  /**
   * The plugin page hides a private repository's name, and Check now sits on that page,
   * open to any viewer with no installation -- so answering with `owner/name` would hand
   * back over one request exactly what the view withholds.
   */
  describe('a private repository', () => {
    const privatePlugin = {
      id: 'p1',
      repoOwner: 'OWOX',
      repoName: 'secret-plugin',
      isPrivateRepo: true,
      suspendedAt: null,
      currentVersionId: 'v1',
      lastSyncReport: null,
      nextUpdateCheckAt: NEXT_CHECK,
    };

    it('withholds its name from an ordinary member', async () => {
      const s = setup({ plugin: privatePlugin });
      s.check.run.mockResolvedValue({
        pluginId: 'p1',
        repository: 'OWOX/secret-plugin',
        outcome: 'up_to_date',
        currentVersionId: 'v1',
        currentSemver: '1.0.0',
        report: { rejections: [] },
      } as never);

      const result = await update(s);

      expect(result.repository).not.toContain('secret-plugin');
      expect(result.repository).toBe('OWOX/***');
    });

    it('gives the canonical repository to an allowlisted publisher', async () => {
      const s = setup({ plugin: privatePlugin });
      s.authorization.isDeploymentPublisher.mockReturnValue(true);
      s.check.run.mockResolvedValue({
        pluginId: 'p1',
        repository: 'OWOX/secret-plugin',
        outcome: 'up_to_date',
        currentVersionId: 'v1',
        currentSemver: '1.0.0',
        report: { rejections: [] },
      } as never);

      await expect(update(s, PUBLISHER)).resolves.toMatchObject({
        repository: 'OWOX/secret-plugin',
      });
    });

    it('leaves a public repository untouched for everyone', async () => {
      await expect(update(setup())).resolves.toMatchObject({ repository: 'OWOX/example' });
    });
  });

  it('resolves a repository locator from cache for the CLI form', async () => {
    const s = setup();

    await s.service.run(new UpdatePluginCommand(PUBLISHER, undefined, 'OWOX/example'));

    expect(s.pluginService.findByRepoName).toHaveBeenCalledWith('OWOX', 'example');
    expect(s.check.run).toHaveBeenCalled();
  });

  /**
   * The by-id form is protected by the id itself, which is a random uuid. `owner/name` is
   * not, so without this the by-repository form answers "does this deployment host X?" to
   * any member of any project -- and then hands over the id that opens the plugin page and
   * the install route. A member-scope publication is meant to be nobody else's business.
   */
  describe('the by-repository form', () => {
    const byRepo = (s: ReturnType<typeof setup>, context = MEMBER) =>
      s.service.run(new UpdatePluginCommand(context, undefined, 'OWOX/example'));

    it('admits a caller the plugin is published to', async () => {
      const s = setup();

      await expect(byRepo(s)).resolves.toMatchObject({ outcome: 'updated' });
    });

    it('admits a caller who installed it, with no publication of their own', async () => {
      const s = setup();
      s.publications.findVisibleTo.mockResolvedValue([]);
      s.installations.findOne.mockResolvedValue({ id: 'i1', uninstalledAt: null } as never);

      await expect(byRepo(s)).resolves.toMatchObject({ outcome: 'updated' });
    });

    it('admits a deployment publisher, so owox-ctl keeps working', async () => {
      const s = setup();
      s.publications.findVisibleTo.mockResolvedValue([]);
      s.authorization.isDeploymentPublisher.mockReturnValue(true);

      await expect(byRepo(s, PUBLISHER)).resolves.toMatchObject({ outcome: 'updated' });
    });

    it('refuses someone else’s member-scope plugin', async () => {
      const s = setup();
      s.publications.findVisibleTo.mockResolvedValue([]);
      s.installations.findOne.mockResolvedValue(null);

      await expect(byRepo(s)).rejects.toBeInstanceOf(NotFoundException);
      expect(s.check.run).not.toHaveBeenCalled();
    });

    // The refusal must not be distinguishable from "no such repository", or it is still an
    // oracle -- just one that costs an extra request to read.
    it('refuses it exactly as it refuses an unknown repository', async () => {
      const hidden = setup();
      hidden.publications.findVisibleTo.mockResolvedValue([]);
      hidden.installations.findOne.mockResolvedValue(null);
      const unknown = setup({ plugin: null });

      const hiddenError = await byRepo(hidden).catch((error: Error) => error);
      const unknownError = await byRepo(unknown).catch((error: Error) => error);

      expect(hiddenError.message).toBe(unknownError.message);
    });
  });
});
