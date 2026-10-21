import { Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { PluginActionSchedule } from '../entities/plugin-action-schedule.entity';
import type { PluginVersion } from '../entities/plugin-version.entity';
import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import { PluginScheduleDisabledReason } from '../enums/plugin-action-schedule.enum';
import {
  ActionInputInvalidError,
  ActionInputTooLargeError,
  ActionNotDeclaredError,
  InstallationInactiveError,
  TooManyExecutionsError,
} from '../errors/plugin-action.errors';
import { OVER_BUDGET } from './action-input-validator.service';
import { scheduleNotHeldError } from './plugin-action-execution.service';
import { PluginActionScheduleHandlerService } from './plugin-action-schedule-handler.service';

const NOW = new Date('2026-10-16T09:00:00.000Z');
const RETRY_AT = new Date('2026-10-16T09:01:00.000Z');
const VERSION = { id: 'version-1', pluginId: 'plugin-1' } as PluginVersion;
const INSTALLATION = {
  id: 'installation-1',
  pluginId: 'plugin-1',
  projectId: 'project-1',
  userId: 'user-1',
  uninstalledAt: null,
};
const PLUGIN = { id: 'plugin-1', currentVersionId: 'version-1', suspendedAt: null };

function schedule(overrides: Partial<PluginActionSchedule> = {}): PluginActionSchedule {
  return Object.assign(new PluginActionSchedule(), {
    id: 'schedule-1',
    pluginId: 'plugin-1',
    installationId: 'installation-1',
    projectId: 'project-1',
    action: 'update-document',
    parameters: { documentId: 'PARAMETERS-MARKER' },
    name: null,
    disabledReason: null,
    lastExecutionId: null,
    isActive: true,
    status: TriggerStatus.PROCESSING,
    version: 2,
    cronExpression: '0 9 * * *',
    timeZone: 'UTC',
    nextRunTimestamp: NOW,
    lastRunTimestamp: null,
    ...overrides,
  });
}

function setup() {
  const repository = { exists: jest.fn().mockResolvedValue(true) };
  const scheduler = { registerTriggerHandler: jest.fn().mockResolvedValue(undefined) };
  const installations = { findById: jest.fn().mockResolvedValue(INSTALLATION) };
  const plugins = { findById: jest.fn().mockResolvedValue(PLUGIN) };
  const versions = { findById: jest.fn().mockResolvedValue(VERSION) };
  const executions = { hasOpenForSchedule: jest.fn().mockResolvedValue(false) };
  const starter = {
    startScheduled: jest
      .fn()
      .mockResolvedValue({ id: 'execution-1', status: PluginActionExecutionStatus.RUNNING }),
  };
  const owners = {
    activeMember: jest.fn().mockResolvedValue({ userId: 'user-1', role: 'viewer' }),
  };
  const shutdown = { isInShutdownMode: jest.fn().mockReturnValue(false) };
  const handler = new PluginActionScheduleHandlerService(
    repository as never,
    scheduler as never,
    installations as never,
    plugins as never,
    versions as never,
    executions as never,
    starter as never,
    owners as never,
    shutdown as never,
    { scheduleRetrySeconds: 60, scheduleStuckSeconds: 600 } as never
  );
  return {
    handler,
    repository,
    scheduler,
    installations,
    plugins,
    versions,
    executions,
    starter,
    owners,
    shutdown,
  };
}

type Setup = ReturnType<typeof setup>;

const NO_VERSION: Array<[string, (s: Setup) => void]> = [
  [
    'the plugin has no current version',
    s => s.plugins.findById.mockResolvedValueOnce({ ...PLUGIN, currentVersionId: null }),
  ],
  ['the current version is missing', s => s.versions.findById.mockResolvedValueOnce(null)],
];

const DISABLING_REFUSALS: Array<[string, Error, PluginScheduleDisabledReason]> = [
  [
    'ActionNotDeclaredError',
    new ActionNotDeclaredError('update-document'),
    PluginScheduleDisabledReason.ACTION_NOT_DECLARED,
  ],
  [
    'ActionInputInvalidError',
    new ActionInputInvalidError([{ instancePath: '/documentId', message: 'must be string' }]),
    PluginScheduleDisabledReason.INVALID_PARAMETERS,
  ],
  [
    'ActionInputTooLargeError',
    new ActionInputTooLargeError(),
    PluginScheduleDisabledReason.INVALID_PARAMETERS,
  ],
];

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('PluginActionScheduleHandlerService', () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('registers itself with the scheduler, polled every minute, with a stuck timeout and no TTL', async () => {
    const s = setup();

    await s.handler.onModuleInit();

    expect(s.scheduler.registerTriggerHandler).toHaveBeenCalledWith(s.handler);
    expect(s.handler.getTriggerRepository()).toBe(s.repository);
    expect(s.handler.processingCronExpression()).toBe('* * * * *');
    expect(s.handler.stuckTriggerTimeoutSeconds()).toBe(600);
    expect('triggerTtlSeconds' in s.handler).toBe(false);
  });

  it('lets a batch finish before the next minute claims more schedules', () => {
    expect(setup().handler.waitForBatchCompletion()).toBe(true);
  });

  it('uses the live role', async () => {
    const s = setup();
    const due = schedule();

    await s.handler.handleTrigger(due);

    expect(s.owners.activeMember).toHaveBeenCalledWith('project-1', 'user-1');
    expect(s.starter.startScheduled).toHaveBeenCalledWith({
      installation: INSTALLATION,
      version: VERSION,
      action: 'update-document',
      input: { documentId: 'PARAMETERS-MARKER' },
      role: 'viewer',
      scheduleId: 'schedule-1',
      scheduleVersion: 2,
    });
    expect(due).toMatchObject({
      lastExecutionId: 'execution-1',
      isActive: true,
      disabledReason: null,
    });
    expect(due.retryAt).toBeFalsy();
    expect(due.parked).toBeFalsy();
  });

  it('keeps a queued execution as the last run', async () => {
    const s = setup();
    s.starter.startScheduled.mockResolvedValueOnce({
      id: 'execution-2',
      status: PluginActionExecutionStatus.QUEUED,
    });
    const due = schedule();

    await s.handler.handleTrigger(due);

    expect(due).toMatchObject({ lastExecutionId: 'execution-2', isActive: true });
  });

  it.each([
    ['is gone', null],
    ['is uninstalled', { ...INSTALLATION, uninstalledAt: new Date('2026-10-01T00:00:00.000Z') }],
  ])('parks the schedule when its installation %s', async (_label, installation) => {
    const s = setup();
    s.installations.findById.mockResolvedValueOnce(installation);
    const due = schedule();

    await s.handler.handleTrigger(due);

    expect(s.installations.findById).toHaveBeenCalledWith('installation-1');
    expect(due.parked).toBe(true);
    expect(due.isActive).toBe(true);
    expect(s.executions.hasOpenForSchedule).not.toHaveBeenCalled();
    expect(s.starter.startScheduled).not.toHaveBeenCalled();
  });

  it('takes the next slot with no execution while the plugin is suspended', async () => {
    const s = setup();
    s.plugins.findById.mockResolvedValueOnce({ ...PLUGIN, suspendedAt: new Date() });
    const due = schedule();

    await s.handler.handleTrigger(due);

    expect(s.plugins.findById).toHaveBeenCalledWith('plugin-1');
    expect(due).toMatchObject({ isActive: true, disabledReason: null, lastExecutionId: null });
    expect(due.parked).toBeFalsy();
    expect(due.retryAt).toBeFalsy();
    expect(s.executions.hasOpenForSchedule).not.toHaveBeenCalled();
    expect(s.starter.startScheduled).not.toHaveBeenCalled();
  });

  it('skips the slot while the previous run is queued or running', async () => {
    const s = setup();
    s.executions.hasOpenForSchedule.mockResolvedValueOnce(true);
    const due = schedule();

    await s.handler.handleTrigger(due);

    expect(s.executions.hasOpenForSchedule).toHaveBeenCalledWith('schedule-1');
    expect(s.owners.activeMember).not.toHaveBeenCalled();
    expect(s.starter.startScheduled).not.toHaveBeenCalled();
    expect(due).toMatchObject({ isActive: true, lastExecutionId: null });
  });

  it('retries in 60 s while the IDP cannot answer, without disabling', async () => {
    const s = setup();
    s.owners.activeMember.mockRejectedValueOnce(new Error('IDP is down'));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const due = schedule();

    await s.handler.handleTrigger(due);

    expect(due.retryAt).toEqual(RETRY_AT);
    expect(due).toMatchObject({ isActive: true, disabledReason: null });
    expect(s.versions.findById).not.toHaveBeenCalled();
    expect(s.starter.startScheduled).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(
      new RegExp(`scheduleId=${due.id} projectId=project-1.*IDP is down`)
    );
    expect(warn.mock.calls[0][0]).not.toContain('PARAMETERS-MARKER');
  });

  it('takes the next slot with no execution while the owner is not an active project member', async () => {
    const s = setup();
    s.owners.activeMember.mockResolvedValueOnce(null);
    const due = schedule();

    await s.handler.handleTrigger(due);

    expect(due).toMatchObject({ isActive: true, disabledReason: null, lastExecutionId: null });
    expect(due.parked).toBeFalsy();
    expect(due.retryAt).toBeFalsy();
    expect(s.starter.startScheduled).not.toHaveBeenCalled();
  });

  it.each(NO_VERSION)(
    'disables the schedule as ACTION_NOT_DECLARED when %s',
    async (_label, arrange) => {
      const s = setup();
      arrange(s);
      const due = schedule();

      await s.handler.handleTrigger(due);

      expect(due).toMatchObject({
        isActive: false,
        nextRunTimestamp: null,
        disabledReason: PluginScheduleDisabledReason.ACTION_NOT_DECLARED,
      });
      expect(s.starter.startScheduled).not.toHaveBeenCalled();
    }
  );

  it.each(DISABLING_REFUSALS)('disables the schedule on %s', async (_label, refusal, reason) => {
    const s = setup();
    s.starter.startScheduled.mockRejectedValueOnce(refusal);
    const due = schedule();

    await s.handler.handleTrigger(due);

    expect(due).toMatchObject({
      isActive: false,
      nextRunTimestamp: null,
      disabledReason: reason,
      lastExecutionId: null,
    });
  });

  it('retries at the next poll when the start began a moment past the minute', async () => {
    const s = setup();
    s.owners.activeMember.mockRejectedValueOnce(new Error('IDP is down'));
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.setSystemTime(new Date(NOW.getTime() + 2_500));
    const due = schedule();

    await s.handler.handleTrigger(due);

    expect(due.retryAt).toEqual(RETRY_AT);
  });

  it('retries in 60 s when the validation pool refuses the start', async () => {
    const s = setup();
    s.starter.startScheduled.mockRejectedValueOnce(
      new TooManyExecutionsError('Input validation is busy. Try again shortly.')
    );
    const due = schedule();

    await s.handler.handleTrigger(due);

    expect(due.retryAt).toEqual(RETRY_AT);
    expect(due).toMatchObject({ isActive: true, disabledReason: null, lastExecutionId: null });
  });

  it('retries in 60 s when the validation ran over its budget, without disabling', async () => {
    const s = setup();
    s.starter.startScheduled.mockRejectedValueOnce(new ActionInputInvalidError(OVER_BUDGET));
    const due = schedule();

    await s.handler.handleTrigger(due);

    expect(due.retryAt).toEqual(RETRY_AT);
    expect(due).toMatchObject({ isActive: true, disabledReason: null, lastExecutionId: null });
    expect(log.mock.calls[0][0]).toMatch(/outcome=RETRY reason=VALIDATION_OVER_BUDGET$/);
  });

  it('parks the schedule when the installation was uninstalled during the start', async () => {
    const s = setup();
    s.starter.startScheduled.mockRejectedValueOnce(new InstallationInactiveError());
    const due = schedule();

    await s.handler.handleTrigger(due);

    expect(due.parked).toBe(true);
    expect(due.isActive).toBe(true);
  });

  it('lets any other error reach the runner, with a retry in 60 s so its save skips no slot', async () => {
    const s = setup();
    const failure = new Error('database is down');
    s.starter.startScheduled.mockRejectedValueOnce(failure);
    const due = schedule();

    await expect(s.handler.handleTrigger(due)).rejects.toBe(failure);
    expect(due.retryAt).toEqual(RETRY_AT);
    expect(due).toMatchObject({ isActive: true, disabledReason: null, lastExecutionId: null });
  });

  it.each([
    ['the installation', (s: Setup) => s.installations.findById],
    ['the plugin', (s: Setup) => s.plugins.findById],
    ['the open runs', (s: Setup) => s.executions.hasOpenForSchedule],
    ['the version', (s: Setup) => s.versions.findById],
  ])('retries in 60 s and rethrows when reading %s fails', async (_label, read) => {
    const s = setup();
    read(s).mockRejectedValueOnce(
      new QueryFailedError(
        'SELECT …',
        ['PARAMETERS-MARKER'],
        Object.assign(new Error('Connection lost: The server closed the connection.'), {
          code: 'PROTOCOL_CONNECTION_LOST',
        })
      )
    );
    const due = schedule();

    const rejected = await s.handler.handleTrigger(due).catch(error => error);

    expect(rejected).toBeInstanceOf(QueryFailedError);
    expect(rejected.parameters).toBeUndefined();
    expect(due.retryAt).toEqual(RETRY_AT);
    expect(due).toMatchObject({ isActive: true, disabledReason: null });
    expect(s.starter.startScheduled).not.toHaveBeenCalled();
  });

  it('drops the query and its parameters from a database error before the runner logs it', async () => {
    const s = setup();
    s.starter.startScheduled.mockRejectedValueOnce(
      new QueryFailedError(
        'INSERT …',
        ['PARAMETERS-MARKER', 'HASH-MARKER'],
        Object.assign(new Error("Data too long for column 'input' at row 1"), {
          code: 'ER_DATA_TOO_LONG',
          errno: 1406,
          sql: 'INSERT … PARAMETERS-MARKER',
        })
      )
    );

    const rejected = await s.handler.handleTrigger(schedule()).catch(error => error);

    expect(rejected).toBeInstanceOf(QueryFailedError);
    expect(rejected.message).toBe("Data too long for column 'input' at row 1");
    expect(rejected.driverError).toMatchObject({ code: 'ER_DATA_TOO_LONG', errno: 1406 });
    const logged = JSON.stringify({ ...rejected, driverError: { ...rejected.driverError } });
    expect(logged).not.toContain('PARAMETERS-MARKER');
    expect(logged).not.toContain('HASH-MARKER');
  });

  it.each([
    ['a deadlock', 'Deadlock found when trying to get lock', 'ER_LOCK_DEADLOCK', 1213],
    ['a lock wait timeout', 'Lock wait timeout exceeded', 'ER_LOCK_WAIT_TIMEOUT', 1205],
    ['a busy SQLite database', 'SQLITE_BUSY: database is locked', 'SQLITE_BUSY', 5],
  ])('retries in 60 s when the start meets %s', async (_label, message, code, errno) => {
    const s = setup();
    s.starter.startScheduled.mockRejectedValueOnce(
      new QueryFailedError(
        'INSERT …',
        ['PARAMETERS-MARKER'],
        Object.assign(new Error(message), { code, errno })
      )
    );
    const due = schedule();

    await s.handler.handleTrigger(due);

    expect(due.retryAt).toEqual(RETRY_AT);
    expect(due).toMatchObject({ isActive: true, disabledReason: null, lastExecutionId: null });
    expect(log.mock.calls[0][0]).toMatch(/outcome=RETRY reason=DB_CONFLICT$/);
  });

  it('lets the optimistic-lock error reach the runner, which then skips its save', async () => {
    const s = setup();
    s.starter.startScheduled.mockRejectedValueOnce(scheduleNotHeldError('schedule-1'));
    const due = schedule();

    const rejected = await s.handler.handleTrigger(due).catch(error => error);

    expect(rejected).toBeInstanceOf(QueryFailedError);
    expect(rejected.message).toContain('optimistic lock');
    expect(due.retryAt).toBeUndefined();
  });

  it('reaches startScheduled one at a time', async () => {
    jest.useRealTimers();
    const s = setup();
    const answers: Array<() => void> = [];
    s.starter.startScheduled.mockImplementation(
      () =>
        new Promise(resolve =>
          answers.push(() =>
            resolve({
              id: `execution-${answers.length}`,
              status: PluginActionExecutionStatus.RUNNING,
            })
          )
        )
    );

    const first = s.handler.handleTrigger(schedule({ id: 'schedule-1' }));
    const second = s.handler.handleTrigger(schedule({ id: 'schedule-2' }));
    await flush();

    expect(s.starter.startScheduled).toHaveBeenCalledTimes(1);

    answers[0]();
    await flush();

    expect(s.starter.startScheduled).toHaveBeenCalledTimes(2);
    expect(s.starter.startScheduled.mock.calls[1][0]).toMatchObject({ scheduleId: 'schedule-2' });

    answers[1]();
    await Promise.all([first, second]);
  });

  it('starts nothing and leaves the row to its new holder once the runner no longer holds it', async () => {
    const s = setup();
    s.repository.exists.mockResolvedValueOnce(false);
    const due = schedule();

    const rejected = await s.handler.handleTrigger(due).catch(error => error);

    expect(s.repository.exists).toHaveBeenCalledWith({
      where: { id: 'schedule-1', status: TriggerStatus.PROCESSING, version: 2 },
    });
    expect(rejected).toBeInstanceOf(QueryFailedError);
    expect(rejected.message).toContain('optimistic lock');
    expect(s.starter.startScheduled).not.toHaveBeenCalled();
    expect(s.installations.findById).not.toHaveBeenCalled();
    expect(due).toMatchObject({ isActive: true, lastExecutionId: null });
    expect(due.retryAt).toBeUndefined();
  });

  it('retries in 60 s instead of starting while the replica shuts down', async () => {
    const s = setup();
    s.shutdown.isInShutdownMode.mockReturnValue(true);
    const due = schedule();

    await s.handler.handleTrigger(due);

    expect(s.starter.startScheduled).not.toHaveBeenCalled();
    expect(due.retryAt).toEqual(RETRY_AT);
    expect(due).toMatchObject({ isActive: true, disabledReason: null, lastExecutionId: null });
    expect(log.mock.calls[0][0]).toMatch(/outcome=RETRY reason=SHUTDOWN$/);
  });

  it('starts no waiting schedule once shutdown begins', async () => {
    jest.useRealTimers();
    const s = setup();
    let answer!: () => void;
    s.starter.startScheduled.mockImplementationOnce(
      () =>
        new Promise(
          resolve =>
            (answer = () =>
              resolve({ id: 'execution-1', status: PluginActionExecutionStatus.RUNNING }))
        )
    );
    const waiting = schedule({ id: 'schedule-2' });

    const first = s.handler.handleTrigger(schedule({ id: 'schedule-1' }));
    const second = s.handler.handleTrigger(waiting);
    await flush();
    s.shutdown.isInShutdownMode.mockReturnValue(true);
    answer();
    await Promise.all([first, second]);

    expect(s.starter.startScheduled).toHaveBeenCalledTimes(1);
    expect(waiting.retryAt).toBeInstanceOf(Date);
    expect(waiting.lastExecutionId).toBeNull();
  });

  it('checks it still holds a waiting schedule once its turn comes, not before the wait', async () => {
    jest.useRealTimers();
    const s = setup();
    let answer!: () => void;
    s.starter.startScheduled.mockImplementationOnce(
      () =>
        new Promise(
          resolve =>
            (answer = () =>
              resolve({ id: 'execution-1', status: PluginActionExecutionStatus.RUNNING }))
        )
    );
    // Another replica takes schedule-2 back while schedule-1 starts.
    let takenOver = false;
    s.repository.exists.mockImplementation(
      async ({ where }: { where: { id: string } }) => !(takenOver && where.id === 'schedule-2')
    );
    const waiting = schedule({ id: 'schedule-2' });

    const first = s.handler.handleTrigger(schedule({ id: 'schedule-1' }));
    const second = s.handler.handleTrigger(waiting).catch(error => error);
    await flush();
    takenOver = true;
    answer();
    await first;
    const rejected = await second;

    expect(rejected).toBeInstanceOf(QueryFailedError);
    expect(rejected.message).toContain('optimistic lock');
    expect(s.starter.startScheduled).toHaveBeenCalledTimes(1);
    expect(waiting).toMatchObject({ isActive: true, lastExecutionId: null });
  });

  it('reads the plugin once its turn comes, so a suspension during the wait starts nothing', async () => {
    jest.useRealTimers();
    const s = setup();
    let answer!: () => void;
    s.starter.startScheduled.mockImplementationOnce(
      () =>
        new Promise(
          resolve =>
            (answer = () =>
              resolve({ id: 'execution-1', status: PluginActionExecutionStatus.RUNNING }))
        )
    );
    let suspendedAt: Date | null = null;
    s.plugins.findById.mockImplementation(async () => ({ ...PLUGIN, suspendedAt }));
    const waiting = schedule({ id: 'schedule-2' });

    const first = s.handler.handleTrigger(schedule({ id: 'schedule-1' }));
    const second = s.handler.handleTrigger(waiting);
    await flush();
    suspendedAt = new Date();
    answer();
    await Promise.all([first, second]);

    expect(s.starter.startScheduled).toHaveBeenCalledTimes(1);
    expect(waiting).toMatchObject({ isActive: true, lastExecutionId: null });
    expect(log.mock.calls[1][0]).toMatch(/scheduleId=schedule-2 .*outcome=PLUGIN_SUSPENDED$/);
  });

  it('does not let a refused start hold up the next one', async () => {
    const s = setup();
    s.starter.startScheduled.mockRejectedValueOnce(
      new TooManyExecutionsError('Input validation is busy. Try again shortly.')
    );
    const first = schedule({ id: 'schedule-1' });
    const second = schedule({ id: 'schedule-2' });

    await Promise.all([s.handler.handleTrigger(first), s.handler.handleTrigger(second)]);

    expect(first.retryAt).toEqual(RETRY_AT);
    expect(second.lastExecutionId).toBe('execution-1');
  });

  it('logs one line per run, naming the schedule and the outcome but never the parameters', async () => {
    const s = setup();

    await s.handler.handleTrigger(schedule());

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toBe(
      'Plugin schedule ran scheduleId=schedule-1 installationId=installation-1 outcome=RUNNING executionId=execution-1'
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('PARAMETERS-MARKER');
  });
});
