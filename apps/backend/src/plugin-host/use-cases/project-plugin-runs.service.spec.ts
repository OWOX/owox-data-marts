import { BadRequestException } from '@nestjs/common';
import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import { ListPluginRunsCommand, PluginRunCommand } from '../dto/domain/plugin-run.command';
import type { PluginRunFilter } from '../dto/domain/plugin-run.dto';
import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import { ExecutionNotFoundError } from '../errors/plugin-action.errors';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import type { PluginRunRow } from '../services/plugin-action-execution.service';
import { decodePluginRunCursor } from '../utils/plugin-run-cursor.util';
import { ProjectPluginRunsService } from './project-plugin-runs.service';

const ADMIN = { projectId: 'project-1', userId: 'admin', roles: ['admin'] } as AuthorizationContext;
const ALICE = {
  projectId: 'project-1',
  userId: 'alice',
  roles: ['editor'],
} as AuthorizationContext;
const ANY: PluginRunFilter = {
  statuses: [],
  trigger: null,
  pluginId: null,
  scheduleId: null,
  userId: null,
};
const STARTED = new Date('2026-10-17T10:00:00.000Z');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const run = (n: number, overrides: Partial<PluginRunRow> = {}): PluginRunRow => ({
  id: id(n),
  pluginId: 'p1',
  pluginVersionId: 'v-run',
  installationId: 'i-alice',
  projectId: 'project-1',
  userId: 'alice',
  action: 'sync',
  trigger: 'schedule',
  scheduleId: 's1',
  status: PluginActionExecutionStatus.SUCCEEDED,
  createdAt: new Date(STARTED.getTime() - n * 1000),
  queuedAt: null,
  startedAt: STARTED,
  deadlineAt: new Date(STARTED.getTime() + 90_000),
  finishedAt: new Date(STARTED.getTime() + 5000),
  errorCode: null,
  errorMessage: null,
  payloadsClearedAt: null,
  ...overrides,
});

function setup(rows: PluginRunRow[] = [run(1), run(2)]) {
  const executions = {
    listRuns: jest.fn(
      async (_projectId: string, _filter: PluginRunFilter, _after: unknown, take: number) =>
        rows.slice(0, take)
    ),
    findRun: jest.fn(async (runId: string) => rows.find(row => row.id === runId) ?? null),
    cancel: jest.fn(async () => true),
  };
  const schedules = {
    findNames: jest.fn(
      async (ids: readonly string[]) =>
        new Map(ids.filter(scheduleId => scheduleId === 's1').map(s => [s, 'Nightly'] as const))
    ),
  };
  const plugins = {
    findByIds: jest.fn(async (ids: readonly string[]) =>
      ids.map(pluginId => ({
        id: pluginId,
        currentVersionId: 'v-current',
        isPrivateRepo: false,
        repoName: 'sheets',
        repoOwner: 'OWOX',
      }))
    ),
  };
  const versions = {
    findByIds: jest.fn(async (ids: readonly string[]) =>
      ids.map(versionId => ({
        id: versionId,
        displayName: versionId === 'v-current' ? 'Sheets Sync' : 'Sheets',
        semver: versionId === 'v-current' ? '1.2.0' : '1.1.0',
        backend:
          versionId === 'v-declared'
            ? { url: 'https://b.example.com', actions: { sync: { timeoutSeconds: 300 } } }
            : null,
      }))
    ),
  };
  const idp = {
    getUserProjectionList: jest.fn(
      async (ids: string[]) =>
        new UserProjectionsListDto(
          ids.map(userId => new UserProjectionDto(userId, `Name of ${userId}`))
        )
    ),
  };
  const service = new ProjectPluginRunsService(
    executions as never,
    schedules as never,
    plugins as never,
    versions as never,
    new PluginPresentationMapper(),
    idp as never
  );
  return { service, executions, schedules, plugins, versions, idp };
}

describe('ProjectPluginRunsService', () => {
  describe('list', () => {
    it('resolves names and owners in one batch per page of several rows', async () => {
      const s = setup([run(1), run(2, { userId: 'bob', scheduleId: 's2' }), run(3)]);

      await s.service.list(new ListPluginRunsCommand(ADMIN, ANY, null, 50));

      expect(s.plugins.findByIds).toHaveBeenCalledTimes(1);
      expect(s.versions.findByIds).toHaveBeenCalledTimes(2);
      expect(s.schedules.findNames).toHaveBeenCalledTimes(1);
      expect(s.schedules.findNames).toHaveBeenCalledWith(['s1', 's2']);
      expect(s.idp.getUserProjectionList).toHaveBeenCalledTimes(1);
      expect(s.idp.getUserProjectionList).toHaveBeenCalledWith(['alice', 'bob']);
    });

    it('reads an admin the filtered project page and names it in one batch', async () => {
      const s = setup();
      const filter = { ...ANY, statuses: [PluginActionExecutionStatus.FAILED], userId: 'bob' };

      const page = await s.service.list(new ListPluginRunsCommand(ADMIN, filter, null, 50));

      expect(s.executions.listRuns).toHaveBeenCalledWith('project-1', filter, null, 51);
      expect(page.nextCursor).toBeNull();
      expect(page.items[0]).toEqual({
        id: id(1),
        pluginId: 'p1',
        pluginName: 'Sheets Sync',
        pluginVersion: '1.1.0',
        action: 'sync',
        status: PluginActionExecutionStatus.SUCCEEDED,
        trigger: 'schedule',
        scheduleId: 's1',
        scheduleName: 'Nightly',
        owner: new UserProjectionDto('alice', 'Name of alice'),
        createdAt: run(1).createdAt,
        queuedAt: null,
        startedAt: STARTED,
        finishedAt: run(1).finishedAt,
        timeLimitSeconds: 90,
        errorCode: null,
        errorMessage: null,
        errorMessageCleared: false,
        canCancel: false,
      });
      expect(s.plugins.findByIds).toHaveBeenCalledTimes(1);
      expect(s.plugins.findByIds).toHaveBeenCalledWith(['p1']);
      expect(s.versions.findByIds).toHaveBeenCalledWith(['v-current']);
      expect(s.versions.findByIds).toHaveBeenCalledWith(['v-run']);
      expect(s.schedules.findNames).toHaveBeenCalledWith(['s1']);
      expect(s.idp.getUserProjectionList).toHaveBeenCalledWith(['alice']);
    });

    it("puts a member's own id over any owner they ask for", async () => {
      const s = setup();

      await s.service.list(new ListPluginRunsCommand(ALICE, { ...ANY, userId: 'admin' }, null, 50));

      expect(s.executions.listRuns).toHaveBeenCalledWith(
        'project-1',
        { ...ANY, userId: 'alice' },
        null,
        51
      );
    });

    it("pages on with a cursor of the page's last row", async () => {
      const s = setup([run(1), run(2), run(3)]);

      const first = await s.service.list(new ListPluginRunsCommand(ADMIN, ANY, null, 2));
      expect(first.items.map(item => item.id)).toEqual([id(1), id(2)]);
      expect(decodePluginRunCursor(first.nextCursor ?? '')).toEqual({
        createdAt: run(2).createdAt,
        id: id(2),
      });

      await s.service.list(new ListPluginRunsCommand(ADMIN, ANY, first.nextCursor, 2));
      expect(s.executions.listRuns).toHaveBeenLastCalledWith(
        'project-1',
        ANY,
        { createdAt: run(2).createdAt, id: id(2) },
        3
      );
    });

    it('shows the declared time limit, not the start window rounded out around it', async () => {
      const s = setup([
        run(1, {
          pluginVersionId: 'v-declared',
          deadlineAt: new Date('2026-10-17T10:05:01.000Z'),
        }),
        run(2, { pluginVersionId: 'v-declared', action: 'toString' }),
      ]);

      const page = await s.service.list(new ListPluginRunsCommand(ADMIN, ANY, null, 50));

      // An action the version does not declare as its own falls back to the stored difference.
      expect(page.items.map(item => item.timeLimitSeconds)).toEqual([300, 90]);
    });

    it('refuses a cursor it did not write, before any read', async () => {
      const s = setup();

      await expect(
        s.service.list(new ListPluginRunsCommand(ADMIN, ANY, id(1), 50))
      ).rejects.toThrow(new BadRequestException('cursor is not a Run History cursor'));
      expect(s.executions.listRuns).not.toHaveBeenCalled();
    });

    it('derives the time limit, a cleared message and who may cancel', async () => {
      const s = setup([
        run(1, {
          status: PluginActionExecutionStatus.QUEUED,
          queuedAt: STARTED,
          startedAt: null,
          deadlineAt: null,
          finishedAt: null,
        }),
        run(2, {
          status: PluginActionExecutionStatus.FAILED,
          errorCode: 'DOC_LOCKED',
          payloadsClearedAt: STARTED,
        }),
        run(3, {
          status: PluginActionExecutionStatus.FAILED,
          errorCode: 'BACKEND_UNREACHABLE',
          errorMessage: 'No answer',
          payloadsClearedAt: STARTED,
        }),
        run(5, {
          status: PluginActionExecutionStatus.FAILED,
          errorCode: 'DOC_LOCKED',
          errorMessage: 'Locked',
          payloadsClearedAt: null,
        }),
        run(4, {
          status: PluginActionExecutionStatus.RUNNING,
          userId: 'bob',
          installationId: 'i-bob',
          scheduleId: 's-gone',
          finishedAt: null,
        }),
      ]);

      const admin = await s.service.list(new ListPluginRunsCommand(ADMIN, ANY, null, 50));
      // The mock ignores the owner filter, so bob's run reaches the member's page here.
      const member = await s.service.list(new ListPluginRunsCommand(ALICE, ANY, null, 50));

      expect(
        admin.items.map(item => [
          item.timeLimitSeconds,
          item.errorMessageCleared,
          item.canCancel,
          item.scheduleName,
        ])
      ).toEqual([
        [null, false, true, 'Nightly'],
        [90, true, false, 'Nightly'],
        [90, false, false, 'Nightly'],
        [90, false, false, 'Nightly'],
        [90, false, true, null],
      ]);
      expect(admin.items.map(item => item.errorMessage)).toEqual([
        null,
        null,
        'No answer',
        'Locked',
        null,
      ]);
      expect(member.items.map(item => item.canCancel)).toEqual([true, false, false, false, false]);
    });

    it('names a plugin whose row is gone by its id, and a gone version as null', async () => {
      const s = setup();
      s.plugins.findByIds.mockResolvedValueOnce([]);
      s.versions.findByIds.mockResolvedValue([]);

      const page = await s.service.list(new ListPluginRunsCommand(ADMIN, ANY, null, 50));

      expect([page.items[0].pluginName, page.items[0].pluginVersion]).toEqual(['p1', null]);
    });
  });

  describe('get and cancel', () => {
    it("lets an admin read and cancel another member's run", async () => {
      const s = setup([run(1, { status: PluginActionExecutionStatus.QUEUED, finishedAt: null })]);

      await expect(s.service.get(new PluginRunCommand(ADMIN, id(1)))).resolves.toMatchObject({
        id: id(1),
        canCancel: true,
      });
      await expect(s.service.cancel(new PluginRunCommand(ADMIN, id(1)))).resolves.toMatchObject({
        id: id(1),
      });
      expect(s.executions.cancel).toHaveBeenCalledWith(id(1), 'i-alice');
    });

    it.each([
      ['another member', { ...ALICE, userId: 'bob' }, id(1)],
      ['an admin of another project', { ...ADMIN, projectId: 'project-2' }, id(1)],
      ['anyone, for an unknown run', ADMIN, id(9)],
    ])('answers EXECUTION_NOT_FOUND to %s and cancels nothing', async (_who, context, runId) => {
      const s = setup([run(1, { status: PluginActionExecutionStatus.RUNNING, finishedAt: null })]);

      await expect(
        s.service.get(new PluginRunCommand(context as AuthorizationContext, runId))
      ).rejects.toBeInstanceOf(ExecutionNotFoundError);
      await expect(
        s.service.cancel(new PluginRunCommand(context as AuthorizationContext, runId))
      ).rejects.toBeInstanceOf(ExecutionNotFoundError);
      expect(s.executions.cancel).not.toHaveBeenCalled();
    });
  });
});
