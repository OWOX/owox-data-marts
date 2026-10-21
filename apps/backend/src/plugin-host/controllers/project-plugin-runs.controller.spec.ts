import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  RejectPluginAuth: jest.requireActual('../../idp/decorators/reject-plugin-auth.decorator')
    .RejectPluginAuth,
  Role: { viewer: jest.fn() },
  Strategy: { INTROSPECT: 'introspect', PARSE: 'parse' },
}));

import { REJECT_PLUGIN_AUTH_METADATA } from '../../idp/decorators/reject-plugin-auth.decorator';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import { ListPluginRunsCommand, PluginRunCommand } from '../dto/domain/plugin-run.command';
import type { PluginRunView } from '../dto/domain/plugin-run.dto';
import { ListPluginRunsQueryApiDto } from '../dto/presentation/plugin-run-api.dto';
import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import type { ProjectPluginRunsService } from '../use-cases/project-plugin-runs.service';
import { ProjectPluginRunsController } from './project-plugin-runs.controller';

const CONTEXT = { projectId: 'project-1', userId: 'alice' } as AuthorizationContext;
const UUID = '1b4e28ba-2fa1-11d2-883f-0016d3cca427';
const VIEW: PluginRunView = {
  id: UUID,
  pluginId: 'p1',
  pluginName: 'Sheets Sync',
  pluginVersion: '1.2.0',
  action: 'sync',
  status: PluginActionExecutionStatus.RUNNING,
  trigger: 'frontend',
  scheduleId: null,
  scheduleName: null,
  owner: null,
  createdAt: new Date('2026-10-17T10:00:00.000Z'),
  queuedAt: null,
  startedAt: new Date('2026-10-17T10:00:01.000Z'),
  finishedAt: null,
  timeLimitSeconds: 60,
  errorCode: null,
  errorMessage: null,
  errorMessageCleared: false,
  canCancel: true,
};
// Spelled out, not spread from VIEW, so a field leaking through the mapper fails toStrictEqual.
const RESPONSE = {
  id: UUID,
  pluginId: 'p1',
  pluginName: 'Sheets Sync',
  pluginVersion: '1.2.0',
  action: 'sync',
  status: PluginActionExecutionStatus.RUNNING,
  trigger: 'frontend',
  scheduleId: null,
  scheduleName: null,
  owner: null,
  createdAt: '2026-10-17T10:00:00.000Z',
  queuedAt: null,
  startedAt: '2026-10-17T10:00:01.000Z',
  finishedAt: null,
  timeLimitSeconds: 60,
  errorCode: null,
  errorMessage: null,
  errorMessageCleared: false,
  canCancel: true,
};
// A field the view may gain later; the response must not carry it.
const LEAKY_VIEW = { ...VIEW, tokenHash: 'secret' } as PluginRunView;

function setup() {
  const service = {
    list: jest.fn(async () => ({ items: [LEAKY_VIEW], nextCursor: 'next' })),
    get: jest.fn(async () => LEAKY_VIEW),
    cancel: jest.fn(async () => LEAKY_VIEW),
  };
  const controller = new ProjectPluginRunsController(
    service as unknown as ProjectPluginRunsService
  );
  return { service, controller };
}

describe('ProjectPluginRunsController', () => {
  it.each(['list', 'get', 'cancel'] as const)('refuses a plugin runtime token on %s', handler => {
    expect(
      new Reflector().getAllAndOverride<boolean>(REJECT_PLUGIN_AUTH_METADATA, [
        ProjectPluginRunsController.prototype[handler],
        ProjectPluginRunsController,
      ])
    ).toBe(true);
  });

  it('reads the query into a command with its defaults, and answers ISO dates', async () => {
    const s = setup();

    await expect(
      s.controller.list(CONTEXT, { status: [PluginActionExecutionStatus.FAILED] })
    ).resolves.toStrictEqual({ items: [RESPONSE], nextCursor: 'next' });
    expect(s.service.list).toHaveBeenCalledWith(
      new ListPluginRunsCommand(
        CONTEXT,
        {
          statuses: [PluginActionExecutionStatus.FAILED],
          trigger: null,
          pluginId: null,
          scheduleId: null,
          userId: null,
        },
        null,
        50
      )
    );
  });

  it('passes the limit and cursor through', async () => {
    const s = setup();

    await s.controller.list(CONTEXT, { limit: 2, cursor: 'c' });

    expect(s.service.list).toHaveBeenCalledWith(
      new ListPluginRunsCommand(
        CONTEXT,
        { statuses: [], trigger: null, pluginId: null, scheduleId: null, userId: null },
        'c',
        2
      )
    );
  });

  it('passes the id to get and cancel', async () => {
    const s = setup();

    await expect(s.controller.get(CONTEXT, UUID)).resolves.toStrictEqual(RESPONSE);
    await expect(s.controller.cancel(CONTEXT, UUID)).resolves.toStrictEqual(RESPONSE);
    expect(s.service.get).toHaveBeenCalledWith(new PluginRunCommand(CONTEXT, UUID));
    expect(s.service.cancel).toHaveBeenCalledWith(new PluginRunCommand(CONTEXT, UUID));
  });

  describe('query', () => {
    const invalid = async (query: Record<string, unknown>) =>
      (await validate(plainToInstance(ListPluginRunsQueryApiDto, query))).map(
        error => error.property
      );

    it('accepts a full query, and reads one status as a list of one', async () => {
      expect(
        await invalid({
          cursor: 'eyJjcmVhdGVkQXQiOiIyMDI2In0',
          limit: '50',
          status: ['FAILED', 'TIMED_OUT'],
          trigger: 'schedule',
          pluginId: UUID,
          scheduleId: UUID,
          userId: 'user-1',
        })
      ).toEqual([]);
      expect(plainToInstance(ListPluginRunsQueryApiDto, { status: 'FAILED' }).status).toEqual([
        'FAILED',
      ]);
    });

    it.each([
      ['an unknown status', { status: ['DONE'] }, 'status'],
      ['a zero limit', { limit: '0' }, 'limit'],
      ['a limit above 50', { limit: '51' }, 'limit'],
      ['a non-numeric limit', { limit: 'ten' }, 'limit'],
      ['an unknown trigger', { trigger: 'cron' }, 'trigger'],
      ['a plugin id that is not a UUID', { pluginId: 'p1' }, 'pluginId'],
      ['a schedule id that is not a UUID', { scheduleId: 's1' }, 'scheduleId'],
      ['a cursor over 512 characters', { cursor: 'x'.repeat(513) }, 'cursor'],
      ['an owner over 255 characters', { userId: 'u'.repeat(256) }, 'userId'],
    ])('rejects %s', async (_case, query, property) => {
      expect(await invalid(query)).toEqual([property]);
    });
  });
});
