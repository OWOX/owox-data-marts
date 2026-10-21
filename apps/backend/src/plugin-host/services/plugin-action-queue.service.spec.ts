import { Logger } from '@nestjs/common';
import type { PluginActionExecution } from '../entities/plugin-action-execution.entity';
import type { PluginVersion } from '../entities/plugin-version.entity';
import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import { PluginScheduleDisabledReason } from '../enums/plugin-action-schedule.enum';
import { TooManyExecutionsError } from '../errors/plugin-action.errors';
import { hashExecutionToken } from '../utils/execution-token.util';
import { OVER_BUDGET } from './action-input-validator.service';
import { PluginActionQueueService } from './plugin-action-queue.service';

const SCHEMA = {
  type: 'object',
  properties: { documentId: { type: 'string' } },
  required: ['documentId'],
};

const VERSION = {
  id: 'version-2',
  pluginId: 'plugin-1',
  deliveryUrl: 'https://a.workers.dev/app/',
  backend: { url: '/owox', actions: { 'update-document': { timeoutSeconds: 60, input: SCHEMA } } },
} as unknown as PluginVersion;

const INSTALLATION = {
  id: 'installation-1',
  projectId: 'project-1',
  userId: 'user-1',
  uninstalledAt: null,
};

const PLUGIN = { id: 'plugin-1', currentVersionId: 'version-2', suspendedAt: null };

function queued(id: string): PluginActionExecution {
  return {
    id,
    pluginId: 'plugin-1',
    pluginVersionId: 'version-1',
    installationId: 'installation-1',
    action: 'update-document',
    input: { documentId: 'INPUT-MARKER' },
    role: 'editor',
    trigger: 'schedule',
    scheduleId: 'schedule-1',
    status: PluginActionExecutionStatus.QUEUED,
  } as PluginActionExecution;
}

function setup(rows: PluginActionExecution[] = [queued('execution-1')]) {
  const findOldestQueued = jest.fn();
  for (const row of rows) findOldestQueued.mockResolvedValueOnce(row);
  findOldestQueued.mockResolvedValue(null);
  const executions = {
    findOldestQueued,
    failQueued: jest.fn().mockResolvedValue(true),
    refusesStart: jest.fn().mockResolvedValue(false),
    promote: jest.fn().mockImplementation(async ({ id }: { id: string }) => ({
      outcome: 'STARTED',
      execution: { ...queued(id), status: PluginActionExecutionStatus.RUNNING },
    })),
  };
  // Never settles, so no chained promotion runs unless a test settles one itself.
  const schedules = { failQueuedAndDisable: jest.fn().mockResolvedValue(true) };
  const dispatcher = {
    dispatch: jest.fn().mockImplementation(() => new Promise<void>(() => undefined)),
  };
  const installations = { findById: jest.fn().mockResolvedValue(INSTALLATION) };
  const plugins = { findById: jest.fn().mockResolvedValue(PLUGIN) };
  const versions = { findById: jest.fn().mockResolvedValue(VERSION) };
  const validator = { validate: jest.fn().mockResolvedValue([]) };
  const owners = {
    activeMember: jest.fn().mockResolvedValue({ userId: 'user-1', role: 'viewer' }),
  };
  const shutdown = { isInShutdownMode: jest.fn().mockReturnValue(false) };
  const queue = new PluginActionQueueService(
    executions as never,
    schedules as never,
    dispatcher as never,
    installations as never,
    plugins as never,
    versions as never,
    validator as never,
    owners as never,
    shutdown as never
  );
  return {
    queue,
    executions,
    schedules,
    dispatcher,
    installations,
    plugins,
    versions,
    validator,
    owners,
    shutdown,
  };
}

type Setup = ReturnType<typeof setup>;

const settle = () => new Promise(resolve => setImmediate(resolve));

const FAILING_CHECKS: Array<
  [string, string, PluginScheduleDisabledReason | null, (s: Setup) => void]
> = [
  [
    'the installation is gone',
    'INSTALLATION_INACTIVE',
    null,
    s => s.installations.findById.mockResolvedValueOnce(null),
  ],
  [
    'the installation is uninstalled',
    'INSTALLATION_INACTIVE',
    null,
    s =>
      s.installations.findById.mockResolvedValueOnce({
        ...INSTALLATION,
        uninstalledAt: new Date(),
      }),
  ],
  [
    'the plugin is suspended',
    'PLUGIN_SUSPENDED',
    null,
    s => s.plugins.findById.mockResolvedValueOnce({ ...PLUGIN, suspendedAt: new Date() }),
  ],
  [
    'the plugin has no current version',
    'ACTION_NOT_DECLARED',
    PluginScheduleDisabledReason.ACTION_NOT_DECLARED,
    s => s.plugins.findById.mockResolvedValueOnce({ ...PLUGIN, currentVersionId: null }),
  ],
  [
    'the current version no longer declares the action',
    'ACTION_NOT_DECLARED',
    PluginScheduleDisabledReason.ACTION_NOT_DECLARED,
    s =>
      s.versions.findById.mockResolvedValueOnce({
        ...VERSION,
        backend: { url: '/owox', actions: {} },
      }),
  ],
  [
    'the stored input no longer matches the schema',
    'INVALID_INPUT',
    PluginScheduleDisabledReason.INVALID_PARAMETERS,
    s =>
      s.validator.validate.mockResolvedValueOnce([
        { instancePath: '/documentId', message: 'must be string' },
      ]),
  ],
  [
    'the owner is no longer an active project member',
    'OWNER_NOT_MEMBER',
    null,
    s => s.owners.activeMember.mockResolvedValueOnce(null),
  ],
];

describe('PluginActionQueueService', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('uses the live role', async () => {
    const s = setup();

    await s.queue.promote('installation-1');

    expect(s.owners.activeMember).toHaveBeenCalledWith('project-1', 'user-1');
    expect(s.validator.validate).toHaveBeenCalledWith('version-2', 'update-document', SCHEMA, {
      documentId: 'INPUT-MARKER',
    });
    expect(s.executions.promote).toHaveBeenCalledWith({
      id: 'execution-1',
      installationId: 'installation-1',
      pluginVersionId: 'version-2',
      role: 'viewer',
      tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      timeoutSeconds: 60,
    });
    const [execution, backendUrl, token, timeoutSeconds] = s.dispatcher.dispatch.mock.calls[0];
    expect(execution).toMatchObject({
      id: 'execution-1',
      status: PluginActionExecutionStatus.RUNNING,
    });
    expect(backendUrl).toBe('https://a.workers.dev/owox');
    expect(hashExecutionToken(token)).toBe(s.executions.promote.mock.calls[0][0].tokenHash);
    expect(timeoutSeconds).toBe(60);
  });

  it('keeps starting queued executions while slots allow', async () => {
    const s = setup([queued('execution-1'), queued('execution-2')]);

    await s.queue.promote('installation-1');

    expect(s.dispatcher.dispatch.mock.calls.map(([execution]) => execution.id)).toEqual([
      'execution-1',
      'execution-2',
    ]);
    expect(s.executions.findOldestQueued).toHaveBeenCalledTimes(3);
    expect(s.executions.findOldestQueued).toHaveBeenCalledWith('installation-1');
  });

  it.each(FAILING_CHECKS)(
    'fails the row when %s, then promotes the next one',
    async (_label, code, reason, arrange) => {
      const s = setup([queued('execution-1'), queued('execution-2')]);
      arrange(s);

      await s.queue.promote('installation-1');

      const failed = reason ? s.schedules.failQueuedAndDisable : s.executions.failQueued;
      expect(failed).toHaveBeenCalledTimes(1);
      expect(failed.mock.calls[0]).toContain(code);
      expect(s.executions.promote).toHaveBeenCalledTimes(1);
      expect(s.executions.promote).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'execution-2' })
      );
    }
  );

  it.each(FAILING_CHECKS.filter(([, , reason]) => reason !== null))(
    'fails the row and disables its schedule in one call when %s, as its own run would',
    async (_label, code, reason, arrange) => {
      const s = setup();
      arrange(s);

      await s.queue.promote('installation-1');

      expect(s.schedules.failQueuedAndDisable).toHaveBeenCalledTimes(1);
      expect(s.schedules.failQueuedAndDisable).toHaveBeenCalledWith(
        { id: 'execution-1', installationId: 'installation-1', scheduleId: 'schedule-1' },
        code,
        expect.any(String),
        reason
      );
      expect(s.executions.failQueued).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        `Plugin schedule disabled scheduleId=schedule-1 executionId=execution-1 reason=${reason}`
      );
    }
  );

  it('logs no disable when the schedule was held, paused or gone', async () => {
    const s = setup();
    s.validator.validate.mockResolvedValueOnce([
      { instancePath: '/documentId', message: 'must be string' },
    ]);
    s.schedules.failQueuedAndDisable.mockResolvedValueOnce(false);

    await s.queue.promote('installation-1');

    expect(s.schedules.failQueuedAndDisable).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.flat().join('\n')).not.toContain('Plugin schedule disabled');
  });

  it.each(FAILING_CHECKS.filter(([, , reason]) => reason === null))(
    'leaves the schedule Active when %s',
    async (_label, _code, _reason, arrange) => {
      const s = setup();
      arrange(s);

      await s.queue.promote('installation-1');

      expect(s.executions.failQueued).toHaveBeenCalledTimes(1);
      expect(s.schedules.failQueuedAndDisable).not.toHaveBeenCalled();
    }
  );

  it('disables no schedule for a row the frontend started', async () => {
    const s = setup([{ ...queued('execution-1'), trigger: 'frontend', scheduleId: null }]);
    s.validator.validate.mockResolvedValueOnce([
      { instancePath: '/documentId', message: 'must be string' },
    ]);

    await s.queue.promote('installation-1');

    expect(s.executions.failQueued).toHaveBeenCalledTimes(1);
    expect(s.schedules.failQueuedAndDisable).not.toHaveBeenCalled();
  });

  it('leaves the row queued when the IDP cannot answer', async () => {
    const s = setup([queued('execution-1'), queued('execution-2')]);
    s.owners.activeMember.mockRejectedValueOnce(new Error('IDP is down'));

    await s.queue.promote('installation-1');

    expect(s.executions.failQueued).not.toHaveBeenCalled();
    expect(s.executions.promote).not.toHaveBeenCalled();
    expect(s.executions.findOldestQueued).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/executionId=execution-1 projectId=project-1.*IDP is down/)
    );
  });

  it('leaves the row queued when the validation pool refuses', async () => {
    const s = setup([queued('execution-1'), queued('execution-2')]);
    s.validator.validate.mockRejectedValueOnce(
      new TooManyExecutionsError('Input validation is busy. Try again shortly.')
    );

    await s.queue.promote('installation-1');

    expect(s.executions.failQueued).not.toHaveBeenCalled();
    expect(s.executions.promote).not.toHaveBeenCalled();
    expect(s.executions.findOldestQueued).toHaveBeenCalledTimes(1);
  });

  it('leaves the row queued when the validation ran over its budget', async () => {
    const s = setup([queued('execution-1'), queued('execution-2')]);
    s.validator.validate.mockResolvedValueOnce(OVER_BUDGET);

    await s.queue.promote('installation-1');

    expect(s.executions.failQueued).not.toHaveBeenCalled();
    expect(s.executions.promote).not.toHaveBeenCalled();
    expect(s.executions.findOldestQueued).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Plugin action stays queued executionId=execution-1 reason=VALIDATION_OVER_BUDGET'
    );
  });

  it('asks neither the IDP nor the validator while a start limit refuses', async () => {
    const s = setup([queued('execution-1'), queued('execution-2')]);
    s.executions.refusesStart.mockResolvedValueOnce(true);

    await s.queue.promote('installation-1');

    expect(s.executions.refusesStart).toHaveBeenCalledWith('installation-1');
    expect(s.owners.activeMember).not.toHaveBeenCalled();
    expect(s.validator.validate).not.toHaveBeenCalled();
    expect(s.executions.failQueued).not.toHaveBeenCalled();
    expect(s.executions.promote).not.toHaveBeenCalled();
    expect(s.executions.findOldestQueued).toHaveBeenCalledTimes(1);
  });

  it('stops when the installation has no free slot', async () => {
    const s = setup([queued('execution-1'), queued('execution-2')]);
    s.executions.promote.mockResolvedValueOnce({ outcome: 'WAIT' });

    await s.queue.promote('installation-1');

    expect(s.executions.promote).toHaveBeenCalledTimes(1);
    expect(s.dispatcher.dispatch).not.toHaveBeenCalled();
    expect(s.executions.findOldestQueued).toHaveBeenCalledTimes(1);
  });

  it('moves on when another promoter took the row', async () => {
    const s = setup([queued('execution-1'), queued('execution-2')]);
    s.executions.promote.mockResolvedValueOnce({ outcome: 'GONE' });

    await s.queue.promote('installation-1');

    expect(s.dispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(s.dispatcher.dispatch.mock.calls[0][0]).toMatchObject({ id: 'execution-2' });
  });

  it('leaves rows queued while the replica shuts down', async () => {
    const s = setup([queued('execution-1')]);
    s.shutdown.isInShutdownMode.mockReturnValue(true);

    await expect(s.queue.promote('installation-1')).resolves.toBeUndefined();

    expect(s.executions.findOldestQueued).not.toHaveBeenCalled();
    expect(s.executions.promote).not.toHaveBeenCalled();
    expect(s.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('promotes the installation once a dispatch settles', async () => {
    const s = setup([]);
    let settleDispatch!: () => void;
    s.dispatcher.dispatch.mockReturnValueOnce(
      new Promise<void>(resolve => (settleDispatch = resolve))
    );
    const execution = { ...queued('execution-1'), status: PluginActionExecutionStatus.RUNNING };

    s.queue.dispatchAndPromote(execution, 'https://a.workers.dev/owox', 'token', 60);
    await settle();

    expect(s.dispatcher.dispatch).toHaveBeenCalledWith(
      execution,
      'https://a.workers.dev/owox',
      'token',
      60
    );
    expect(s.executions.findOldestQueued).not.toHaveBeenCalled();

    settleDispatch();
    await settle();

    expect(s.executions.findOldestQueued).toHaveBeenCalledWith('installation-1');
  });

  it('never rejects, and logs no input', async () => {
    const s = setup([queued('execution-1'), queued('execution-2')]);
    s.owners.activeMember.mockResolvedValueOnce(null);
    s.executions.findOldestQueued.mockRejectedValueOnce(new Error('database is down'));

    await expect(s.queue.promote('installation-1')).resolves.toBeUndefined();

    expect(s.executions.failQueued).toHaveBeenCalledWith(
      'execution-1',
      'OWNER_NOT_MEMBER',
      'The installation owner is no longer a project member, or their account is locked'
    );
    expect(s.dispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify([...log.mock.calls, ...warn.mock.calls, ...error.mock.calls]);
    expect(logged).toContain('execution-1');
    expect(logged).not.toContain('INPUT-MARKER');
  });
});
