import { NotFoundException } from '@nestjs/common';
import { AuthorizationContext } from '../../idp/types/auth.types';
import { UpdatePluginCommand } from '../dto/domain/update-plugin.command';
import { PluginUpdateScheduleService } from '../services/plugin-update-schedule.service';
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

  return {
    service: new UpdatePluginService(pluginService, authorization, schedule, check, versionService),
    pluginService,
    authorization,
    schedule,
    check,
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

  it('resolves a repository locator from cache for the CLI form', async () => {
    const s = setup();

    await s.service.run(new UpdatePluginCommand(PUBLISHER, undefined, 'OWOX/example'));

    expect(s.pluginService.findByRepoName).toHaveBeenCalledWith('OWOX', 'example');
    expect(s.check.run).toHaveBeenCalled();
  });
});
