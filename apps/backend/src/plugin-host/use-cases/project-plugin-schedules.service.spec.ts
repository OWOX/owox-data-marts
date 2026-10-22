import { Logger } from '@nestjs/common';
import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import type { PluginScheduleView } from '../dto/domain/plugin-action-schedule.dto';
import {
  ListProjectPluginSchedulesCommand,
  ProjectPluginScheduleCommand,
} from '../dto/domain/project-plugin-schedule.command';
import {
  ScheduleNotFoundError,
  ScheduleOwnerCheckUnavailableError,
  ScheduleOwnerNotMemberError,
} from '../errors/plugin-schedule.errors';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { ProjectPluginSchedulesService } from './project-plugin-schedules.service';

const ADMIN = { projectId: 'project-1', userId: 'admin', roles: ['admin'] } as AuthorizationContext;
const ALICE = {
  projectId: 'project-1',
  userId: 'alice',
  roles: ['editor'],
} as AuthorizationContext;

const INSTALLATIONS = [
  { id: 'i-alice', pluginId: 'p1', projectId: 'project-1', userId: 'alice', uninstalledAt: null },
  {
    id: 'i-bob',
    pluginId: 'p1',
    projectId: 'project-1',
    userId: 'bob',
    uninstalledAt: new Date('2026-10-10T00:00:00.000Z'),
  },
];

const view = (id: string, installationId: string): PluginScheduleView => ({
  id,
  pluginId: INSTALLATIONS.find(installation => installation.id === installationId)!.pluginId,
  installationId,
  name: null,
  action: 'sync',
  parameters: { token: 'secret' },
  cron: '0 8 * * *',
  timeZone: 'UTC',
  enabled: true,
  disabledReason: null,
  nextRunAt: null,
  lastRun: null,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  modifiedAt: new Date('2026-10-01T00:00:00.000Z'),
});

function setup(
  options: {
    scheduleInstallation?: string | null;
    /** The IDP's answer for each owner; a member with the role `editor` when unset. */
    owners?: Record<string, { isOutbound: boolean } | undefined>;
  } = {}
) {
  const schedules = {
    listForInstallations: jest.fn(async (ids: readonly string[]) => ({
      views: ids.map(id => view(`s-${id}`, id)),
      total: ids.length,
    })),
    // `s-<installation>` belongs to that installation unless a test says otherwise.
    findInstallationId: jest.fn(async (id: string) =>
      options.scheduleInstallation === undefined
        ? id.replace(/^s-/, '')
        : options.scheduleInstallation
    ),
    pause: jest.fn(async (installationId: string, id: string) => ({
      ...view(id, installationId),
      enabled: false,
    })),
    resume: jest.fn(async (installationId: string, id: string) => view(id, installationId)),
    delete: jest.fn(async () => undefined),
  };
  const installations = {
    findByProject: jest.fn(async () => INSTALLATIONS),
    findByMember: jest.fn(async (_projectId: string, userId: string) =>
      INSTALLATIONS.filter(installation => installation.userId === userId)
    ),
    findById: jest.fn(
      async (id: string) => INSTALLATIONS.find(installation => installation.id === id) ?? null
    ),
  };
  const plugins = {
    findByIds: jest.fn(async (ids: readonly string[]) =>
      ids.map(id => ({
        id,
        currentVersionId: 'v1',
        isPrivateRepo: false,
        repoName: 'sheets',
        repoOwner: 'OWOX',
      }))
    ),
  };
  const versions = {
    findByIds: jest.fn(async (ids: readonly string[]) =>
      ids.map(id => ({ id, displayName: 'Sheets Sync', semver: '1.2.0' }))
    ),
  };
  // bob has no projection yet: IdpGuard writes one on a member's first state-changing request.
  const idp = {
    getProjectMemberOrThrow: jest.fn(async (_projectId: string, userId: string) =>
      options.owners && userId in options.owners
        ? options.owners[userId]
        : { userId, role: 'editor', isOutbound: false }
    ),
    getUserProjectionList: jest.fn(
      async (ids: string[]) =>
        new UserProjectionsListDto(
          ids.filter(id => id !== 'bob').map(id => new UserProjectionDto(id, `Name of ${id}`))
        )
    ),
  };
  // bob has left the project.
  const owners = { activeMemberIds: jest.fn(async () => new Set(['admin', 'alice'])) };
  const service = new ProjectPluginSchedulesService(
    schedules as never,
    installations as never,
    plugins as never,
    versions as never,
    new PluginPresentationMapper(),
    idp as never,
    owners as never
  );
  return { service, schedules, installations, plugins, versions, idp, owners };
}

describe('ProjectPluginSchedulesService', () => {
  describe('list', () => {
    it("gives an admin every installation's schedules, each manageable, named and owned", async () => {
      const s = setup();

      const page = await s.service.list(new ListProjectPluginSchedulesCommand(ADMIN, 100, 0, null));

      expect(s.installations.findByProject).toHaveBeenCalledWith('project-1');
      expect(s.installations.findByMember).not.toHaveBeenCalled();
      expect(s.schedules.listForInstallations).toHaveBeenCalledWith(['i-alice', 'i-bob'], 100, 0);
      expect(page.total).toBe(2);
      expect(
        page.items.map(item => [
          item.schedule.id,
          item.pluginName,
          item.installationState,
          item.owner?.fullName ?? null,
          item.canManage,
        ])
      ).toEqual([
        ['s-i-alice', 'Sheets Sync', 'installed', 'Name of alice', true],
        ['s-i-bob', 'Sheets Sync', 'uninstalled', null, true],
      ]);
    });

    it("gives anyone else only their own installations' schedules", async () => {
      const s = setup();

      const page = await s.service.list(new ListProjectPluginSchedulesCommand(ALICE, 100, 0, null));

      expect(s.installations.findByMember).toHaveBeenCalledWith('project-1', 'alice');
      expect(s.installations.findByProject).not.toHaveBeenCalled();
      expect(s.schedules.listForInstallations).toHaveBeenCalledWith(['i-alice'], 100, 0);
      expect(page.items.map(item => [item.schedule.id, item.canManage])).toEqual([
        ['s-i-alice', true],
      ]);
    });

    it('tells an admin whose owner is no longer an active member, with one IDP list', async () => {
      const s = setup();

      const page = await s.service.list(new ListProjectPluginSchedulesCommand(ADMIN, 100, 0, null));

      expect(page.items.map(item => [item.schedule.id, item.ownerIsMember])).toEqual([
        ['s-i-alice', true],
        ['s-i-bob', false],
      ]);
      expect(s.owners.activeMemberIds).toHaveBeenCalledTimes(1);
      expect(s.owners.activeMemberIds).toHaveBeenCalledWith('project-1');
    });

    it("asks the IDP nothing for the caller's own schedules: the caller is a member", async () => {
      const s = setup();

      const page = await s.service.list(new ListProjectPluginSchedulesCommand(ALICE, 100, 0, null));

      expect(page.items.map(item => item.ownerIsMember)).toEqual([true]);
      expect(s.owners.activeMemberIds).not.toHaveBeenCalled();
    });

    it('lists the schedules with owners unknown when the IDP cannot say', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const s = setup();
      s.owners.activeMemberIds.mockRejectedValueOnce(new Error('IDP is down'));

      const page = await s.service.list(new ListProjectPluginSchedulesCommand(ADMIN, 100, 0, null));

      expect(page.items.map(item => item.ownerIsMember)).toEqual([null, null]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('projectId=project-1'));
      warn.mockRestore();
    });

    it("reads another member's installation as one with no schedules", async () => {
      const s = setup();

      const page = await s.service.list(
        new ListProjectPluginSchedulesCommand(ALICE, 100, 0, 'i-bob')
      );

      expect(s.schedules.listForInstallations).toHaveBeenCalledWith([], 100, 0);
      expect(page).toEqual({ items: [], total: 0 });
    });

    it('narrows an admin to the installation asked for, and passes the page on', async () => {
      const s = setup();

      await s.service.list(new ListProjectPluginSchedulesCommand(ADMIN, 10, 20, 'i-bob'));

      expect(s.schedules.listForInstallations).toHaveBeenCalledWith(['i-bob'], 10, 20);
    });

    it('resolves plugins, versions and owners once per page', async () => {
      const s = setup();

      await s.service.list(new ListProjectPluginSchedulesCommand(ADMIN, 100, 0, null));

      expect(s.plugins.findByIds).toHaveBeenCalledTimes(1);
      expect(s.plugins.findByIds).toHaveBeenCalledWith(['p1']);
      expect(s.versions.findByIds).toHaveBeenCalledWith(['v1']);
      expect(s.idp.getUserProjectionList).toHaveBeenCalledTimes(1);
      expect(s.idp.getUserProjectionList).toHaveBeenCalledWith(['alice', 'bob']);
    });

    it('names a plugin whose row is gone by its id', async () => {
      const s = setup();
      s.plugins.findByIds.mockResolvedValueOnce([]);

      const page = await s.service.list(new ListProjectPluginSchedulesCommand(ADMIN, 100, 0, null));

      expect(page.items.map(item => item.pluginName)).toEqual(['p1', 'p1']);
    });
  });

  describe('pause, resume and delete', () => {
    it("lets an admin change another member's schedule of a removed plugin", async () => {
      const s = setup();

      const paused = await s.service.pause(new ProjectPluginScheduleCommand(ADMIN, 's-i-bob'));
      await s.service.resume(new ProjectPluginScheduleCommand(ADMIN, 's-i-bob'));
      await s.service.delete(new ProjectPluginScheduleCommand(ADMIN, 's-i-bob'));

      expect(s.schedules.findInstallationId).toHaveBeenCalledWith('s-i-bob');
      expect(s.installations.findById).toHaveBeenCalledWith('i-bob');
      expect(s.schedules.pause).toHaveBeenCalledWith('i-bob', 's-i-bob', { byAdmin: true });
      expect(s.schedules.resume).toHaveBeenCalledWith('i-bob', 's-i-bob');
      expect(s.schedules.delete).toHaveBeenCalledWith('i-bob', 's-i-bob');
      expect(paused).toMatchObject({
        schedule: { id: 's-i-bob', enabled: false },
        pluginName: 'Sheets Sync',
        installationState: 'uninstalled',
        canManage: true,
      });
    });

    it('lets the owner change their own schedule', async () => {
      const s = setup();

      const resumed = await s.service.resume(new ProjectPluginScheduleCommand(ALICE, 's-i-alice'));

      expect(s.schedules.resume).toHaveBeenCalledWith('i-alice', 's-i-alice');
      expect(s.idp.getProjectMemberOrThrow).toHaveBeenCalledWith('project-1', 'alice');
      expect(resumed).toMatchObject({ owner: { fullName: 'Name of alice' }, canManage: true });
    });

    it("pauses the owner's own schedule without an admin's reason, admin or not", async () => {
      const s = setup();

      await s.service.pause(new ProjectPluginScheduleCommand(ALICE, 's-i-alice'));
      await s.service.pause(
        new ProjectPluginScheduleCommand({ ...ADMIN, userId: 'alice' }, 's-i-alice')
      );

      expect(s.schedules.pause.mock.calls).toEqual([
        ['i-alice', 's-i-alice', { byAdmin: false }],
        ['i-alice', 's-i-alice', { byAdmin: false }],
      ]);
    });

    it.each([
      ['has left the project', undefined],
      ['is listed as outbound', { isOutbound: true }],
    ])('refuses to resume a schedule whose owner %s, and pause still works', async (_case, bob) => {
      const s = setup({ owners: { bob } });

      await expect(
        s.service.resume(new ProjectPluginScheduleCommand(ADMIN, 's-i-bob'))
      ).rejects.toBeInstanceOf(ScheduleOwnerNotMemberError);
      expect(s.schedules.resume).not.toHaveBeenCalled();
      await s.service.pause(new ProjectPluginScheduleCommand(ADMIN, 's-i-bob'));
      expect(s.schedules.pause).toHaveBeenCalledWith('i-bob', 's-i-bob', { byAdmin: true });
    });

    it('resumes nothing and answers OWNER_CHECK_UNAVAILABLE when the IDP cannot say whether the owner is a member', async () => {
      const s = setup();
      s.idp.getProjectMemberOrThrow.mockRejectedValueOnce(new Error('IDP is down'));
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await expect(
        s.service.resume(new ProjectPluginScheduleCommand(ADMIN, 's-i-bob'))
      ).rejects.toBeInstanceOf(ScheduleOwnerCheckUnavailableError);
      expect(s.schedules.resume).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        'Plugin schedule owner check failed scheduleId=s-i-bob projectId=project-1: IDP is down'
      );
      warn.mockRestore();
    });

    it.each([
      ['another member', ALICE, 's-i-bob', undefined],
      ['an admin of another project', { ...ADMIN, projectId: 'project-2' }, 's-i-alice', undefined],
      ['anyone, for an unknown schedule', ADMIN, 's-gone', null],
      ['anyone, for a schedule whose installation is gone', ADMIN, 's-gone', 'i-gone'],
    ])(
      'answers SCHEDULE_NOT_FOUND to %s and changes nothing',
      async (_who, context, id, scheduleInstallation) => {
        const s = setup({ scheduleInstallation });

        for (const write of ['pause', 'resume', 'delete'] as const) {
          await expect(
            s.service[write](new ProjectPluginScheduleCommand(context as AuthorizationContext, id))
          ).rejects.toBeInstanceOf(ScheduleNotFoundError);
        }
        expect(s.schedules.pause).not.toHaveBeenCalled();
        expect(s.schedules.resume).not.toHaveBeenCalled();
        expect(s.schedules.delete).not.toHaveBeenCalled();
      }
    );
  });
});
