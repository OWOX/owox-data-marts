jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { Logger } from '@nestjs/common';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { In } from 'typeorm';
import type { PluginScheduleDraft } from '../dto/domain/plugin-action-schedule.dto';
import { PluginActionSchedule } from '../entities/plugin-action-schedule.entity';
import { PluginInstallation } from '../entities/plugin-installation.entity';
import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import { PluginScheduleDisabledReason } from '../enums/plugin-action-schedule.enum';
import {
  ActionNotDeclaredError,
  InstallationInactiveError,
  TooManyExecutionsError,
} from '../errors/plugin-action.errors';
import {
  InvalidScheduleError,
  ScheduleBusyError,
  ScheduleNotFoundError,
  ScheduleParametersInvalidError,
  ScheduleParametersTooLargeError,
  SchedulePausedByAdminError,
  TooManySchedulesError,
} from '../errors/plugin-schedule.errors';
import { OVER_BUDGET } from './action-input-validator.service';
import { PluginActionScheduleService } from './plugin-action-schedule.service';

const NOW = new Date('2026-10-14T12:00:00.000Z');
const NEXT_NINE = new Date('2026-10-15T09:00:00.000Z');
const OWNER = { installationId: 'i1', pluginId: 'p1', projectId: 'project-1' };
const DRAFT: PluginScheduleDraft = {
  action: 'update-document',
  parameters: { documentId: 'd1' },
  cron: '0 9 * * *',
  timeZone: 'UTC',
  name: 'Morning sync',
};
const VERSION = {
  id: 'v1',
  backend: {
    url: 'https://backend.example.com/owox',
    actions: {
      'update-document': { timeoutSeconds: 60, input: { type: 'object' } },
      'list-documents': { timeoutSeconds: 30 },
    },
  },
};
const PAUSED = { isActive: false, nextRunTimestamp: null, disabledReason: null };
const DISABLED = {
  isActive: false,
  nextRunTimestamp: null,
  disabledReason: PluginScheduleDisabledReason.INVALID_PARAMETERS,
};
const PAUSED_BY_ADMIN = {
  isActive: false,
  nextRunTimestamp: null,
  disabledReason: PluginScheduleDisabledReason.PAUSED_BY_ADMIN,
};

function schedule(overrides: Partial<PluginActionSchedule> = {}): PluginActionSchedule {
  return Object.assign(new PluginActionSchedule(), {
    id: 's1',
    pluginId: 'p1',
    installationId: 'i1',
    projectId: 'project-1',
    action: 'update-document',
    parameters: { documentId: 'd1' },
    name: 'Morning sync',
    cronExpression: '0 9 * * *',
    timeZone: 'UTC',
    isActive: true,
    status: TriggerStatus.IDLE,
    version: 3,
    nextRunTimestamp: NEXT_NINE,
    lastRunTimestamp: null,
    disabledReason: null,
    lastExecutionId: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    modifiedAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  });
}

interface Options {
  stranded?: PluginActionSchedule[];
  /** Successive reads of the schedule; the last one repeats. */
  reads?: (PluginActionSchedule | null)[];
  /** Successive `affected` counts of the compare-and-set; the last one repeats. */
  affected?: number[];
  locked?: number;
  count?: number;
  version?: object | null;
  errors?: readonly { instancePath: string; message: string }[];
  uninstalledAt?: Date | null;
  summaries?: object[];
  maxSchedulesPerInstallation?: number;
  maxScheduleParametersBytes?: number;
}

function setup(options: Options = {}) {
  const calls: string[] = [];
  const next = <T>(queue: T[]): T => (queue.length > 1 ? (queue.shift() as T) : queue[0]);
  const reads = [...(options.reads ?? [schedule()])];
  const affected = [...(options.affected ?? [1])];
  const lockQuery = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn(async () => {
      calls.push('lock');
      return { affected: options.locked ?? 1 };
    }),
  };
  const installations = {
    createQueryBuilder: jest.fn(() => lockQuery),
    findOneBy: jest.fn(async () => ({ id: 'i1', uninstalledAt: options.uninstalledAt ?? null })),
  };
  const strandedQuery = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn(async () => options.stranded ?? []),
  };
  const schedules = {
    metadata: {
      columns: ['id', 'installationId', 'parameters', 'name'].map(propertyName => ({
        propertyName,
      })),
    },
    createQueryBuilder: jest.fn(() => strandedQuery),
    create: jest.fn((values: object) => Object.assign(new PluginActionSchedule(), values)),
    countBy: jest.fn(async () => {
      calls.push('count');
      return options.count ?? 0;
    }),
    save: jest.fn(async (row: PluginActionSchedule) => {
      calls.push('insert');
      return Object.assign(row, { id: 's-new', version: 1, createdAt: NOW, modifiedAt: NOW });
    }),
    findOneBy: jest.fn(async () => next(reads)),
    findOne: jest.fn(async () => next(reads)),
    find: jest.fn(async () => reads.filter(Boolean)),
    findBy: jest.fn(async () => reads.filter(Boolean)),
    findAndCount: jest.fn(async () => {
      const rows = reads.filter(Boolean);
      return [rows, rows.length];
    }),
    update: jest.fn(async (_criteria: object, _values: Record<string, unknown>) => {
      calls.push('update');
      return { affected: next(affected) };
    }),
    delete: jest.fn(async (_criteria: object) => {
      calls.push('delete');
      return { affected: next(affected) };
    }),
  };
  const plugins = { findById: jest.fn(async () => ({ id: 'p1', currentVersionId: 'v1' })) };
  const versions = {
    findById: jest.fn(async () => (options.version === undefined ? VERSION : options.version)),
  };
  const validator = { validate: jest.fn(async () => options.errors ?? []) };
  const executions = {
    cancelQueuedForSchedule: jest.fn(async () => {
      calls.push('cancel');
      return 0;
    }),
    findLastRuns: jest.fn(async (_ids: readonly string[]) => options.summaries ?? []),
    failQueued: jest.fn(async () => {
      calls.push('fail');
      return true;
    }),
  };
  const service = new PluginActionScheduleService(
    schedules as never,
    installations as never,
    plugins as never,
    versions as never,
    validator as never,
    executions as never,
    {
      maxSchedulesPerInstallation: options.maxSchedulesPerInstallation ?? 20,
      maxScheduleParametersBytes: options.maxScheduleParametersBytes ?? 64 * 1024,
    } as never
  );
  return { service, calls, lockQuery, strandedQuery, schedules, versions, validator, executions };
}

describe('PluginActionScheduleService', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('validation', () => {
    it.each([
      ['a cron expression cron cannot read', { cron: 'every morning' }],
      ['an unknown time zone', { timeZone: 'Mars/Olympus' }],
      ['an empty time zone', { timeZone: '' }],
      ["luxon's local zone", { timeZone: 'local' }],
      ["luxon's system zone", { timeZone: 'system' }],
      ["luxon's default zone", { timeZone: 'default' }],
      ['a cron with no date in the next 8 years', { cron: '0 0 30 2 *' }],
      ['a name over 200 characters', { name: 'n'.repeat(201) }],
      ['a cron over 255 characters', { cron: `0 9 * * ${'1,'.repeat(130)}1` }],
      ['a time zone over 64 characters', { timeZone: `Europe/${'K'.repeat(60)}` }],
    ])('refuses %s as INVALID_SCHEDULE before reading the action', async (_label, change) => {
      const s = setup();

      await expect(s.service.create(OWNER, { ...DRAFT, ...change }, true)).rejects.toBeInstanceOf(
        InvalidScheduleError
      );
      expect(s.versions.findById).not.toHaveBeenCalled();
      expect(s.lockQuery.execute).not.toHaveBeenCalled();
    });

    it.each(['Europe/Kyiv', 'Europe/Kiev', 'UTC'])('accepts the time zone %s', async timeZone => {
      const s = setup();

      await expect(s.service.create(OWNER, { ...DRAFT, timeZone }, true)).resolves.toMatchObject({
        timeZone,
      });
    });

    it.each(['delete-document', 'constructor'])(
      'refuses %s as ACTION_NOT_DECLARED',
      async action => {
        const s = setup();

        await expect(s.service.create(OWNER, { ...DRAFT, action }, true)).rejects.toBeInstanceOf(
          ActionNotDeclaredError
        );
      }
    );

    it('refuses any action when the plugin has no current version', async () => {
      const s = setup({ version: null });

      await expect(s.service.create(OWNER, DRAFT, true)).rejects.toBeInstanceOf(
        ActionNotDeclaredError
      );
    });

    it('refuses parameters nested deeper than 100 levels before validating them', async () => {
      const s = setup();
      const parameters = JSON.parse(`${'['.repeat(101)}${']'.repeat(101)}`);

      const refusal = await s.service
        .create(OWNER, { ...DRAFT, parameters }, true)
        .catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(ScheduleParametersInvalidError);
      expect((refusal as ScheduleParametersInvalidError).errorDetails).toEqual({
        errors: [{ instancePath: '', message: 'is nested deeper than 100 levels' }],
      });
      expect(s.validator.validate).not.toHaveBeenCalled();
    });

    it('refuses parameters over 64 KiB and admits exactly 64 KiB', async () => {
      const s = setup();
      // JSON.stringify adds the two quotes.
      const exact = 'x'.repeat(64 * 1024 - 2);

      await expect(
        s.service.create(
          OWNER,
          { ...DRAFT, action: 'list-documents', parameters: `${exact}x` },
          true
        )
      ).rejects.toBeInstanceOf(ScheduleParametersTooLargeError);
      await expect(
        s.service.create(OWNER, { ...DRAFT, action: 'list-documents', parameters: exact }, true)
      ).resolves.toMatchObject({ parameters: exact });
    });

    it('refuses parameters the action schema rejects, with its errors, before locking', async () => {
      const errors = [{ instancePath: '/documentId', message: 'must be string' }];
      const s = setup({ errors });

      const refusal = await s.service.create(OWNER, DRAFT, true).catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(ScheduleParametersInvalidError);
      expect((refusal as ScheduleParametersInvalidError).errorDetails).toEqual({ errors });
      expect(s.validator.validate).toHaveBeenCalledWith(
        'v1',
        'update-document',
        { type: 'object' },
        { documentId: 'd1' }
      );
      expect(s.lockQuery.execute).not.toHaveBeenCalled();
    });

    it('passes a busy validation pool on as TOO_MANY_EXECUTIONS', async () => {
      const s = setup();
      s.validator.validate.mockRejectedValueOnce(new TooManyExecutionsError('busy'));

      await expect(s.service.create(OWNER, DRAFT, true)).rejects.toBeInstanceOf(
        TooManyExecutionsError
      );
    });

    it('answers a validation over its budget as TOO_MANY_EXECUTIONS, not as invalid parameters', async () => {
      const s = setup({ errors: OVER_BUDGET });

      await expect(s.service.create(OWNER, DRAFT, true)).rejects.toBeInstanceOf(
        TooManyExecutionsError
      );
      await expect(s.service.update('i1', 's1', { name: 'Renamed' })).rejects.toBeInstanceOf(
        TooManyExecutionsError
      );
      expect(s.lockQuery.execute).not.toHaveBeenCalled();
      expect(s.schedules.update).not.toHaveBeenCalled();
    });

    it('stores missing parameters as null', async () => {
      const s = setup();

      const view = await s.service.create(
        OWNER,
        { ...DRAFT, action: 'list-documents', parameters: undefined },
        true
      );

      expect(s.schedules.create).toHaveBeenCalledWith(
        expect.objectContaining({ parameters: null })
      );
      expect(view.parameters).toBeNull();
      expect(s.validator.validate).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('locks the installation, counts its schedules, then inserts an active schedule at its next slot', async () => {
      const s = setup();

      const view = await s.service.create(OWNER, DRAFT, true);

      expect(s.calls).toEqual(['lock', 'count', 'insert']);
      expect(s.lockQuery.where).toHaveBeenCalledWith('id = :id', { id: 'i1' });
      expect(s.lockQuery.andWhere).toHaveBeenCalledWith('uninstalledAt IS NULL');
      expect(s.schedules.save).toHaveBeenCalledWith(
        expect.objectContaining({
          pluginId: 'p1',
          installationId: 'i1',
          projectId: 'project-1',
          action: 'update-document',
          parameters: { documentId: 'd1' },
          cronExpression: '0 9 * * *',
          timeZone: 'UTC',
          name: 'Morning sync',
          isActive: true,
          status: TriggerStatus.IDLE,
          nextRunTimestamp: NEXT_NINE,
          disabledReason: null,
          lastExecutionId: null,
        })
      );
      expect(view).toEqual({
        id: 's-new',
        pluginId: 'p1',
        installationId: 'i1',
        name: 'Morning sync',
        action: 'update-document',
        parameters: { documentId: 'd1' },
        cron: '0 9 * * *',
        timeZone: 'UTC',
        enabled: true,
        disabledReason: null,
        nextRunAt: NEXT_NINE,
        lastRun: null,
        createdAt: NOW,
        modifiedAt: NOW,
      });
    });

    it('creates a Paused schedule when enabled is false', async () => {
      const s = setup();

      await expect(s.service.create(OWNER, DRAFT, false)).resolves.toMatchObject({
        enabled: false,
        nextRunAt: null,
      });
      expect(s.schedules.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false, nextRunTimestamp: null })
      );
    });

    it('refuses an installation the lock did not find', async () => {
      const s = setup({ locked: 0 });

      await expect(s.service.create(OWNER, DRAFT, true)).rejects.toBeInstanceOf(
        InstallationInactiveError
      );
      expect(s.calls).toEqual(['lock']);
    });

    it('refuses a 21st schedule without inserting it, and admits a 20th', async () => {
      const full = setup({ count: 20 });

      await expect(full.service.create(OWNER, DRAFT, true)).rejects.toBeInstanceOf(
        TooManySchedulesError
      );
      expect(full.calls).toEqual(['lock', 'count']);
      await expect(setup({ count: 19 }).service.create(OWNER, DRAFT, true)).resolves.toMatchObject({
        id: 's-new',
      });
    });

    it('takes both limits from the deployment and names them in the refusal', async () => {
      await expect(
        setup({ count: 3, maxSchedulesPerInstallation: 3 }).service.create(OWNER, DRAFT, true)
      ).rejects.toThrow('This installation already has 3 schedules');
      await expect(
        setup({ maxScheduleParametersBytes: 1024 }).service.create(
          OWNER,
          { ...DRAFT, action: 'list-documents', parameters: 'x'.repeat(1024) },
          true
        )
      ).rejects.toThrow('Schedule parameters are larger than 1 KiB');
    });
  });

  describe('update', () => {
    it('writes only while the row is IDLE at the version read, giving an active schedule its new slot', async () => {
      const s = setup();

      const view = await s.service.update('i1', 's1', { cron: '30 6 * * *' });

      expect(s.schedules.findOneBy).toHaveBeenCalledWith({ id: 's1', installationId: 'i1' });
      expect(s.schedules.update).toHaveBeenCalledWith(
        { id: 's1', installationId: 'i1', status: TriggerStatus.IDLE, version: 3 },
        expect.objectContaining({
          cronExpression: '30 6 * * *',
          nextRunTimestamp: new Date('2026-10-15T06:30:00.000Z'),
          modifiedAt: NOW,
          version: expect.any(Function),
        })
      );
      expect((s.schedules.update.mock.calls[0][1].version as () => string)()).toBe('version + 1');
      expect(view).toMatchObject({
        cron: '30 6 * * *',
        enabled: true,
        nextRunAt: new Date('2026-10-15T06:30:00.000Z'),
        modifiedAt: NOW,
      });
    });

    it.each([
      ['a name-only', { name: 'Renamed' }],
      ['a parameters-only', { parameters: { documentId: 'd2' } }],
      ['an unchanged cron and time zone', { cron: '0 9 * * *', timeZone: 'UTC' }],
    ])('keeps the pending slot on %s update', async (_label, patch) => {
      const retryAt = new Date('2026-10-14T12:01:00.000Z');
      const s = setup({ reads: [schedule({ nextRunTimestamp: retryAt })] });

      await expect(s.service.update('i1', 's1', patch)).resolves.toMatchObject({
        nextRunAt: retryAt,
      });
      expect(s.schedules.update.mock.calls[0][1]).toMatchObject({ nextRunTimestamp: retryAt });
    });

    it('moves the slot when only the time zone changes', async () => {
      const s = setup();

      await expect(
        s.service.update('i1', 's1', { timeZone: 'Europe/Kyiv' })
      ).resolves.toMatchObject({ nextRunAt: new Date('2026-10-15T06:00:00.000Z') });
    });

    it('keeps a Paused schedule without a slot on a cron change', async () => {
      const s = setup({ reads: [schedule(PAUSED)] });

      await expect(s.service.update('i1', 's1', { cron: '30 6 * * *' })).resolves.toMatchObject({
        enabled: false,
        nextRunAt: null,
      });
      expect(s.schedules.update.mock.calls[0][1]).toMatchObject({ nextRunTimestamp: null });
    });

    it('keeps a Disabled schedule disabled, reason included', async () => {
      const s = setup({ reads: [schedule(DISABLED)] });

      const view = await s.service.update('i1', 's1', { parameters: { documentId: 'd2' } });

      const values = s.schedules.update.mock.calls[0][1];
      expect(values).toMatchObject({ parameters: { documentId: 'd2' }, nextRunTimestamp: null });
      expect(values).not.toHaveProperty('isActive');
      expect(values).not.toHaveProperty('disabledReason');
      expect(view).toMatchObject({
        enabled: false,
        disabledReason: PluginScheduleDisabledReason.INVALID_PARAMETERS,
        nextRunAt: null,
      });
    });

    it.each([
      ['the action', { action: 'list-documents' }],
      ['the parameters', { parameters: { documentId: 'd2' } }],
    ])(
      "cancels the queued execution once an update changes %s, in the write's transaction after the lock",
      async (_label, patch) => {
        const s = setup();

        await s.service.update('i1', 's1', patch);

        expect(s.calls).toEqual(['lock', 'update', 'cancel']);
        expect(s.lockQuery.where).toHaveBeenCalledWith('id = :id', { id: 'i1' });
        expect(s.executions.cancelQueuedForSchedule).toHaveBeenCalledWith('s1');
      }
    );

    it('cancels nothing when the write lost to another one', async () => {
      const s = setup({
        reads: [schedule({ version: 3 }), schedule({ version: 4 })],
        affected: [0, 1],
      });

      const updated = s.service.update('i1', 's1', { parameters: { documentId: 'd2' } });
      await jest.advanceTimersByTimeAsync(200);
      await updated;

      expect(s.calls).toEqual(['lock', 'update', 'lock', 'update', 'cancel']);
    });

    it.each([
      ['the name', { name: 'Renamed' }],
      ['the cron', { cron: '30 6 * * *' }],
      [
        'the name, resending the same action and parameters',
        { action: 'update-document', parameters: { documentId: 'd1' }, name: 'Renamed' },
      ],
    ])('keeps the queued execution when an update changes only %s', async (_label, patch) => {
      const s = setup();

      await s.service.update('i1', 's1', patch);

      expect(s.calls).toEqual(['update']);
      expect(s.executions.cancelQueuedForSchedule).not.toHaveBeenCalled();
    });

    it('validates the merged schedule whatever its state, and writes nothing it refuses', async () => {
      const s = setup({
        reads: [schedule(PAUSED)],
        errors: [{ instancePath: '/documentId', message: 'must be string' }],
      });

      await expect(s.service.update('i1', 's1', { name: 'Renamed' })).rejects.toBeInstanceOf(
        ScheduleParametersInvalidError
      );
      expect(s.validator.validate).toHaveBeenCalledWith(
        'v1',
        'update-document',
        { type: 'object' },
        { documentId: 'd1' }
      );
      expect(s.schedules.update).not.toHaveBeenCalled();
    });
  });

  describe('when the runner holds the schedule', () => {
    it('waits while the row is not IDLE and writes once it is', async () => {
      const s = setup({
        reads: [
          schedule({ status: TriggerStatus.PROCESSING }),
          schedule({ status: TriggerStatus.PROCESSING }),
          schedule(),
        ],
      });

      const paused = s.service.pause('i1', 's1');
      await jest.advanceTimersByTimeAsync(400);

      await expect(paused).resolves.toMatchObject({ enabled: false });
      expect(s.schedules.findOneBy).toHaveBeenCalledTimes(3);
      expect(s.schedules.update).toHaveBeenCalledTimes(1);
    });

    it('reads again when another write moved the version', async () => {
      const s = setup({
        reads: [schedule({ version: 3 }), schedule({ version: 4 })],
        affected: [0, 1],
      });

      const deleted = s.service.delete('i1', 's1');
      await jest.advanceTimersByTimeAsync(200);

      await expect(deleted).resolves.toBeUndefined();
      expect(s.schedules.delete).toHaveBeenLastCalledWith({
        id: 's1',
        installationId: 'i1',
        status: TriggerStatus.IDLE,
        version: 4,
      });
    });

    it('answers SCHEDULE_BUSY after 5 s without writing', async () => {
      const s = setup({ reads: [schedule({ status: TriggerStatus.PROCESSING })] });
      let settled = false;
      const outcome = s.service
        .pause('i1', 's1')
        .catch((error: unknown) => error)
        .finally(() => {
          settled = true;
        });

      await jest.advanceTimersByTimeAsync(4999);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);

      await expect(outcome).resolves.toBeInstanceOf(ScheduleBusyError);
      expect(s.schedules.update).not.toHaveBeenCalled();
      expect(s.executions.cancelQueuedForSchedule).not.toHaveBeenCalled();
    });
  });

  describe('pause and resume', () => {
    it('pauses an active schedule, then cancels its queued execution, both after the lock', async () => {
      const s = setup();

      await expect(s.service.pause('i1', 's1')).resolves.toMatchObject({
        enabled: false,
        nextRunAt: null,
        disabledReason: null,
      });
      expect(s.schedules.update).toHaveBeenCalledWith(expect.objectContaining({ version: 3 }), {
        isActive: false,
        nextRunTimestamp: null,
        modifiedAt: NOW,
        version: expect.any(Function),
      });
      expect(s.calls).toEqual(['lock', 'update', 'cancel']);
      expect(s.executions.cancelQueuedForSchedule).toHaveBeenCalledWith('s1');
    });

    it('pauses and cancels without the lock once the installation is uninstalled', async () => {
      const s = setup({ locked: 0 });

      await expect(s.service.pause('i1', 's1')).resolves.toMatchObject({ enabled: false });
      expect(s.calls).toEqual(['lock', 'update', 'cancel']);
    });

    it.each([
      ['Paused', PAUSED],
      ['Disabled', DISABLED],
      ['Paused by an admin', PAUSED_BY_ADMIN],
    ])('leaves a %s schedule as it is on pause, still cancelling', async (_state, state) => {
      const s = setup({ reads: [schedule(state)] });

      await expect(s.service.pause('i1', 's1')).resolves.toMatchObject({
        enabled: false,
        disabledReason: state.disabledReason,
      });
      expect(s.calls).toEqual(['lock', 'cancel']);
    });

    it.each([
      ['an Active', {}],
      ['a Paused', PAUSED],
      ['a Disabled', DISABLED],
    ])("records an admin's pause of %s schedule as PAUSED_BY_ADMIN", async (_state, state) => {
      const s = setup({ reads: [schedule(state)] });

      await expect(s.service.pause('i1', 's1', { byAdmin: true })).resolves.toMatchObject({
        enabled: false,
        nextRunAt: null,
        disabledReason: PluginScheduleDisabledReason.PAUSED_BY_ADMIN,
      });
      expect(s.schedules.update.mock.calls[0][1]).toMatchObject({
        isActive: false,
        nextRunTimestamp: null,
        disabledReason: PluginScheduleDisabledReason.PAUSED_BY_ADMIN,
      });
      expect(s.calls).toEqual(['lock', 'update', 'cancel']);
    });

    it("refuses the plugin's resume of a schedule an admin paused, without validating it", async () => {
      const s = setup({ reads: [schedule(PAUSED_BY_ADMIN)] });

      await expect(s.service.resume('i1', 's1', { byPlugin: true })).rejects.toBeInstanceOf(
        SchedulePausedByAdminError
      );
      expect(s.validator.validate).not.toHaveBeenCalled();
      expect(s.schedules.update).not.toHaveBeenCalled();
    });

    it("lets the plugin resume any other Disabled schedule, and a member an admin's pause", async () => {
      const plugin = setup({ reads: [schedule(DISABLED)] });
      const member = setup({ reads: [schedule(PAUSED_BY_ADMIN)] });

      await expect(plugin.service.resume('i1', 's1', { byPlugin: true })).resolves.toMatchObject({
        enabled: true,
        disabledReason: null,
      });
      await expect(member.service.resume('i1', 's1')).resolves.toMatchObject({
        enabled: true,
        disabledReason: null,
        nextRunAt: NEXT_NINE,
      });
      expect(member.schedules.update.mock.calls[0][1]).toMatchObject({ disabledReason: null });
    });

    it('resumes a Disabled schedule after validating it, clearing the reason and setting its next slot', async () => {
      const s = setup({ reads: [schedule(DISABLED)] });

      await expect(s.service.resume('i1', 's1')).resolves.toMatchObject({
        enabled: true,
        disabledReason: null,
        nextRunAt: NEXT_NINE,
      });
      expect(s.validator.validate).toHaveBeenCalledTimes(1);
      expect(s.schedules.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          isActive: true,
          disabledReason: null,
          nextRunTimestamp: NEXT_NINE,
        })
      );
    });

    it('leaves a resume refused by validation Disabled', async () => {
      const s = setup({
        reads: [schedule(DISABLED)],
        errors: [{ instancePath: '/documentId', message: 'must be string' }],
      });

      await expect(s.service.resume('i1', 's1')).rejects.toBeInstanceOf(
        ScheduleParametersInvalidError
      );
      expect(s.schedules.update).not.toHaveBeenCalled();
    });

    it('resumes the schedule of an uninstalled installation without a slot', async () => {
      const s = setup({ reads: [schedule(PAUSED)], uninstalledAt: NOW });

      await expect(s.service.resume('i1', 's1')).resolves.toMatchObject({
        enabled: true,
        nextRunAt: null,
      });
    });

    it('leaves an active schedule as it is on resume', async () => {
      const s = setup();

      await s.service.resume('i1', 's1');

      expect(s.validator.validate).not.toHaveBeenCalled();
      expect(s.schedules.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes only an IDLE row at the version read, then cancels its queued execution', async () => {
      const s = setup();

      await s.service.delete('i1', 's1');

      expect(s.schedules.delete).toHaveBeenCalledWith({
        id: 's1',
        installationId: 'i1',
        status: TriggerStatus.IDLE,
        version: 3,
      });
      expect(s.calls).toEqual(['lock', 'delete', 'cancel']);
    });

    it('deletes and cancels without the lock once the installation is uninstalled', async () => {
      const s = setup({ locked: 0 });

      await s.service.delete('i1', 's1');

      expect(s.calls).toEqual(['lock', 'delete', 'cancel']);
    });

    it('lets any other lock failure end the transaction before it writes', async () => {
      const s = setup();
      s.lockQuery.execute.mockRejectedValueOnce(new Error('database is down'));

      await expect(s.service.delete('i1', 's1')).rejects.toThrow('database is down');
      expect(s.calls).toEqual([]);
    });
  });

  describe('failQueuedAndDisable', () => {
    const QUEUED = { id: 'e1', installationId: 'i1', scheduleId: 's1' };

    it('fails the queued run, then disables its schedule, both after the lock', async () => {
      const s = setup();

      await expect(
        s.service.failQueuedAndDisable(
          QUEUED,
          'ACTION_NOT_DECLARED',
          'The action is gone',
          PluginScheduleDisabledReason.ACTION_NOT_DECLARED
        )
      ).resolves.toBe(true);

      expect(s.calls).toEqual(['lock', 'fail', 'update']);
      expect(s.executions.failQueued).toHaveBeenCalledWith(
        'e1',
        'ACTION_NOT_DECLARED',
        'The action is gone'
      );
      expect(s.schedules.update).toHaveBeenCalledWith(
        { id: 's1', status: TriggerStatus.IDLE, isActive: true },
        expect.objectContaining({
          disabledReason: PluginScheduleDisabledReason.ACTION_NOT_DECLARED,
        })
      );
    });

    it('disables nothing when an update cancelled the run first', async () => {
      const s = setup();
      s.executions.failQueued.mockResolvedValueOnce(false);

      await expect(
        s.service.failQueuedAndDisable(
          QUEUED,
          'INVALID_INPUT',
          'Bad input',
          PluginScheduleDisabledReason.INVALID_PARAMETERS
        )
      ).resolves.toBe(false);

      expect(s.schedules.update).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle hooks', () => {
    it('parks every schedule of the installation the runner does not hold, moving its version', async () => {
      const s = setup();

      await s.service.parkForInstallation('i1');

      expect(s.schedules.update).toHaveBeenCalledWith(
        { installationId: 'i1', status: TriggerStatus.IDLE },
        { nextRunTimestamp: null, version: expect.any(Function) }
      );
    });

    it('disables an Active schedule the runner does not hold, as its own run would', async () => {
      const s = setup();

      await expect(
        s.service.disableIfIdle('s1', PluginScheduleDisabledReason.ACTION_NOT_DECLARED)
      ).resolves.toBe(true);

      expect(s.schedules.update).toHaveBeenCalledWith(
        { id: 's1', status: TriggerStatus.IDLE, isActive: true },
        {
          isActive: false,
          nextRunTimestamp: null,
          disabledReason: PluginScheduleDisabledReason.ACTION_NOT_DECLARED,
          version: expect.any(Function),
        }
      );
      expect((s.schedules.update.mock.calls[0][1].version as () => string)()).toBe('version + 1');
    });

    it('reports a schedule that was held, paused or gone as not disabled', async () => {
      const s = setup({ affected: [0] });

      await expect(
        s.service.disableIfIdle('s1', PluginScheduleDisabledReason.ACTION_NOT_DECLARED)
      ).resolves.toBe(false);
    });

    it('gives each stranded schedule of an active installation its next slot, without waiting', async () => {
      const s = setup({
        stranded: [
          schedule({ id: 's1', nextRunTimestamp: null }),
          schedule({ id: 's2', version: 7, nextRunTimestamp: null }),
        ],
        affected: [0, 1],
      });

      await expect(s.service.unparkStranded(NOW, 500)).resolves.toBe(1);

      expect(s.strandedQuery.innerJoin).toHaveBeenCalledWith(
        PluginInstallation,
        'i',
        'i.id = s.installationId AND i.uninstalledAt IS NULL'
      );
      expect(s.strandedQuery.limit).toHaveBeenCalledWith(500);
      expect(s.schedules.update.mock.calls.map(([criteria]) => criteria)).toEqual([
        { id: 's1', status: TriggerStatus.IDLE, version: 3 },
        { id: 's2', status: TriggerStatus.IDLE, version: 7 },
      ]);
      expect(s.schedules.update).toHaveBeenCalledWith(expect.anything(), {
        nextRunTimestamp: NEXT_NINE,
        version: expect.any(Function),
      });
      expect(s.schedules.findOneBy).not.toHaveBeenCalled();
    });

    it('skips a stranded schedule whose stored cron no longer parses and unparks the rest', async () => {
      const s = setup({
        stranded: [
          schedule({ id: 's1', cronExpression: 'not a cron', nextRunTimestamp: null }),
          schedule({ id: 's2', nextRunTimestamp: null }),
        ],
      });
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      await expect(s.service.unparkStranded(NOW, 500)).resolves.toBe(1);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('Plugin schedule s1 has no next slot');
      expect(s.schedules.update).toHaveBeenCalledTimes(1);
      expect(s.schedules.update.mock.calls[0][0]).toEqual({
        id: 's2',
        status: TriggerStatus.IDLE,
        version: 3,
      });
    });

    it('does nothing when no schedule is stranded', async () => {
      const s = setup({ stranded: [] });

      await expect(s.service.unparkStranded(NOW, 500)).resolves.toBe(0);

      expect(s.schedules.update).not.toHaveBeenCalled();
    });
  });

  describe('reads', () => {
    it('names schedules by name, or by action when unnamed, and has no entry for an id without a row', async () => {
      const s = setup({ reads: [schedule(), schedule({ id: 's2', name: null })] });

      const names = await s.service.findNames(['s1', 's2', 's-gone']);

      expect(s.schedules.find).toHaveBeenCalledWith({
        select: { id: true, name: true, action: true },
        where: { id: In(['s1', 's2', 's-gone']) },
      });
      expect([...names]).toEqual([
        ['s1', 'Morning sync'],
        ['s2', 'update-document'],
      ]);
      s.schedules.find.mockClear();
      await expect(s.service.findNames([])).resolves.toEqual(new Map());
      expect(s.schedules.find).not.toHaveBeenCalled();
    });

    it("reads a schedule's installation by id, and null for an unknown id", async () => {
      const s = setup({ reads: [schedule(), null] });

      await expect(s.service.findInstallationId('s1')).resolves.toBe('i1');
      expect(s.schedules.findOne).toHaveBeenCalledWith({
        select: { id: true, installationId: true },
        where: { id: 's1' },
      });
      await expect(s.service.findInstallationId('s-gone')).resolves.toBeNull();
    });

    it('lists in creation order with each last run', async () => {
      const finishedAt = new Date('2026-10-14T09:00:05.000Z');
      const s = setup({
        reads: [schedule({ lastExecutionId: 'e1' }), schedule({ id: 's2' })],
        summaries: [
          {
            id: 'e1',
            status: PluginActionExecutionStatus.FAILED,
            errorCode: 'BACKEND_UNREACHABLE',
            finishedAt,
          },
        ],
      });

      const views = await s.service.list('i1');

      expect(s.schedules.find).toHaveBeenCalledWith({
        where: { installationId: 'i1' },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
      expect(s.executions.findLastRuns).toHaveBeenCalledWith(['e1']);
      expect(views.map(view => view.lastRun)).toEqual([
        {
          executionId: 'e1',
          status: PluginActionExecutionStatus.FAILED,
          errorCode: 'BACKEND_UNREACHABLE',
          finishedAt,
        },
        null,
      ]);
    });

    it('reads a deleted last execution as null', async () => {
      const s = setup({ reads: [schedule({ lastExecutionId: 'e-swept' })], summaries: [] });

      await expect(s.service.get('i1', 's1')).resolves.toMatchObject({ lastRun: null });
      await expect(s.service.list('i1')).resolves.toEqual([
        expect.objectContaining({ lastRun: null }),
      ]);
    });

    it('answers SCHEDULE_NOT_FOUND for a schedule the installation does not have', async () => {
      const s = setup({ reads: [null] });

      await expect(s.service.get('i1', 's1')).rejects.toBeInstanceOf(ScheduleNotFoundError);
    });

    it('lists the schedules of several installations a page at a time, with the total', async () => {
      const s = setup({ reads: [schedule(), schedule({ id: 's2', installationId: 'i2' })] });

      const { views, total } = await s.service.listForInstallations(['i1', 'i2'], 50, 100);

      expect(s.schedules.findAndCount).toHaveBeenCalledWith({
        select: { id: true, installationId: true, name: true },
        where: { installationId: In(['i1', 'i2']) },
        order: { createdAt: 'ASC', id: 'ASC' },
        take: 50,
        skip: 100,
      });
      expect(total).toBe(2);
      expect(views.map(view => [view.id, view.pluginId, view.installationId])).toEqual([
        ['s1', 'p1', 'i1'],
        ['s2', 'p1', 'i2'],
      ]);
    });

    it('answers no installations with an empty page and no query', async () => {
      const s = setup();

      await expect(s.service.listForInstallations([], 100, 0)).resolves.toEqual({
        views: [],
        total: 0,
      });
      expect(s.schedules.findAndCount).not.toHaveBeenCalled();
    });
  });
});
