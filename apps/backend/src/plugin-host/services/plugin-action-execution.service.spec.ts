jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { In, IsNull, LessThan, MoreThan, QueryFailedError } from 'typeorm';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import { InstallationInactiveError, TooManyExecutionsError } from '../errors/plugin-action.errors';
import {
  InsertRunningExecutionInput,
  InsertScheduledExecutionInput,
  PromoteQueuedExecutionInput,
  PluginActionExecutionService,
} from './plugin-action-execution.service';

const NOW = new Date('2026-10-14T12:00:00.000Z');

const REQUEST: InsertRunningExecutionInput = {
  pluginId: 'p1',
  pluginVersionId: 'v1',
  installationId: 'i1',
  projectId: 'project-1',
  userId: 'user-1',
  action: 'update-document',
  input: { documentId: 'd1' },
  inputBytes: Buffer.byteLength('{"documentId":"d1"}'),
  role: 'editor',
  timeoutSeconds: 60,
  tokenHash: 'a'.repeat(64),
  trigger: 'frontend',
};

const { trigger: _frontend, ...UNTRIGGERED } = REQUEST;
const SCHEDULED: InsertScheduledExecutionInput = {
  ...UNTRIGGERED,
  scheduleId: 's1',
  scheduleVersion: 3,
};

type Totals = {
  perMinute: string | number | null;
  perDay: string | number | null;
  bytes: string | number | null;
};
const NONE: Totals = { perMinute: null, perDay: null, bytes: null };

function setup(
  options: {
    locked?: number;
    running?: number;
    totals?: Totals;
    unstarted?: Totals;
    updated?: number;
    scheduleUpdated?: number;
  } = {}
) {
  const calls: string[] = [];
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
  const installations = { createQueryBuilder: jest.fn(() => lockQuery) };
  const totalsQuery = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(async () => {
      calls.push('totals');
      return options.totals ?? { perMinute: '0', perDay: '0', bytes: null };
    }),
    getRawMany: jest.fn().mockResolvedValue([]),
  };
  // The second start-limit query: queued runs that were cancelled or failed before they started.
  const unstartedQuery = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(async () => options.unstarted ?? NONE),
  };
  const executions = {
    createQueryBuilder: jest
      .fn<typeof totalsQuery | typeof unstartedQuery, []>(() => totalsQuery)
      .mockReturnValueOnce(totalsQuery)
      .mockReturnValueOnce(unstartedQuery),
    countBy: jest.fn(async () => {
      calls.push('count');
      return options.running ?? 0;
    }),
    existsBy: jest.fn().mockResolvedValue(false),
    create: jest.fn((row: object) => row),
    save: jest.fn(async (row: object) => {
      calls.push('insert');
      return { id: 'e1', ...row };
    }),
    update: jest.fn().mockImplementation(async () => {
      calls.push('update');
      return { affected: options.updated ?? 1 };
    }),
    findOne: jest.fn().mockResolvedValue(null),
    findOneByOrFail: jest
      .fn()
      .mockResolvedValue({ id: 'e1', status: PluginActionExecutionStatus.RUNNING }),
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };
  const schedules = {
    update: jest.fn().mockImplementation(async () => {
      calls.push('schedule');
      return { affected: options.scheduleUpdated ?? 1 };
    }),
  };
  const service = new PluginActionExecutionService(
    executions as never,
    installations as never,
    schedules as never
  );
  return { service, calls, lockQuery, executions, totalsQuery, unstartedQuery, schedules };
}

describe('PluginActionExecutionService', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  describe('insertRunning', () => {
    it('locks the installation before it counts, and counts before it inserts', async () => {
      const s = setup();

      await s.service.insertRunning(REQUEST);

      expect(s.calls).toEqual(['lock', 'count', 'totals', 'insert']);
      expect(s.lockQuery.set).toHaveBeenCalledWith({ modifiedAt: expect.any(Function) });
      expect(s.lockQuery.set.mock.calls[0][0].modifiedAt()).toBe('modifiedAt');
      expect(s.lockQuery.where).toHaveBeenCalledWith('id = :id', { id: 'i1' });
      expect(s.lockQuery.andWhere).toHaveBeenCalledWith('uninstalledAt IS NULL');
    });

    it('refuses an installation the lock did not find, before anything else runs', async () => {
      const s = setup({ locked: 0 });

      await expect(s.service.insertRunning(REQUEST)).rejects.toBeInstanceOf(
        InstallationInactiveError
      );
      expect(s.calls).toEqual(['lock']);
    });

    it('refuses a sixth running execution without inserting it', async () => {
      const s = setup({ running: 5 });

      await expect(s.service.insertRunning(REQUEST)).rejects.toBeInstanceOf(TooManyExecutionsError);
      expect(s.calls).toEqual(['lock', 'count']);
    });

    it.each([
      [
        'per minute',
        { perMinute: '60', perDay: '60', bytes: '0' },
        NONE,
        '60 starts per minute reached',
      ],
      [
        'per day',
        { perMinute: 3, perDay: '5000', bytes: '0' },
        NONE,
        '5000 starts per day reached',
      ],
      [
        'in stored bytes',
        { perMinute: 0, perDay: 0, bytes: String(100 * 1024 * 1024) },
        NONE,
        '100 MiB of stored payloads reached',
      ],
      [
        'per minute, with a queued run that never started',
        { perMinute: '59', perDay: '59', bytes: '0' },
        { perMinute: '1', perDay: '1', bytes: '0' },
        '60 starts per minute reached',
      ],
      [
        'per day, with a queued run that never started',
        { perMinute: 3, perDay: '4999', bytes: '0' },
        { perMinute: 0, perDay: '1', bytes: '0' },
        '5000 starts per day reached',
      ],
      [
        'in stored bytes, with a queued run that never started',
        { perMinute: 0, perDay: 0, bytes: String(100 * 1024 * 1024 - 1) },
        { perMinute: 0, perDay: 0, bytes: '1' },
        '100 MiB of stored payloads reached',
      ],
    ])(
      'refuses a start over the limit %s, naming it and leaving the input out',
      async (_n, totals, unstarted, message) => {
        const s = setup({ totals, unstarted });

        const refusal = await s.service.insertRunning(REQUEST).catch((error: unknown) => error);

        expect(refusal).toBeInstanceOf(TooManyExecutionsError);
        expect((refusal as Error).message).toBe(message);
        expect(s.calls).toEqual(['lock', 'count', 'totals']);
      }
    );

    it('admits a start one below every limit, bounding the sums by startedAt', async () => {
      const s = setup({
        totals: { perMinute: '59', perDay: '4999', bytes: String(100 * 1024 * 1024 - 1) },
      });

      await s.service.insertRunning(REQUEST);

      expect(s.calls).toEqual(['lock', 'count', 'totals', 'insert']);
      expect(s.totalsQuery.andWhere).toHaveBeenCalledWith('e.startedAt > :bytesSince');
      expect(s.totalsQuery.setParameters).toHaveBeenCalledWith({
        minuteAgo: new Date(NOW.getTime() - 60_000),
        dayAgo: new Date(NOW.getTime() - 24 * 3_600_000),
        bytesSince: new Date(NOW.getTime() - 48 * 3_600_000),
      });
      expect(s.unstartedQuery.andWhere).toHaveBeenCalledWith('e.status IN (:...statuses)', {
        statuses: [
          PluginActionExecutionStatus.CANCELLED,
          PluginActionExecutionStatus.FAILED,
          PluginActionExecutionStatus.TIMED_OUT,
        ],
      });
      expect(s.unstartedQuery.andWhere).toHaveBeenCalledWith('e.startedAt IS NULL');
      expect(s.unstartedQuery.andWhere).toHaveBeenCalledWith('e.queuedAt > :bytesSince');
    });

    it('stores the UTF-8 byte length of the input as payloadBytes', async () => {
      const s = setup();

      await s.service.insertRunning({
        ...REQUEST,
        input: { t: 'é😀' },
        inputBytes: Buffer.byteLength('{"t":"é😀"}'),
      });

      expect(s.executions.create).toHaveBeenCalledWith(
        expect.objectContaining({ payloadBytes: Buffer.byteLength('{"t":"é😀"}') })
      );
    });

    it('counts only RUNNING rows whose deadline is still ahead', async () => {
      const s = setup();

      await s.service.insertRunning(REQUEST);

      expect(s.executions.countBy).toHaveBeenCalledWith({
        installationId: 'i1',
        status: PluginActionExecutionStatus.RUNNING,
        deadlineAt: MoreThan(NOW),
      });
    });

    it.each([
      ['12:00:00.750Z', '12:00:00.000Z', '12:00:02.000Z'],
      ['12:00:00.000Z', '12:00:00.000Z', '12:00:01.000Z'],
    ])(
      'at %s starts the clock at %s and rounds the deadline up to %s, so a 1 s action keeps its second',
      async (now, startedAt, deadlineAt) => {
        jest.setSystemTime(new Date(`2026-10-14T${now}`));
        const s = setup();

        await s.service.insertRunning({ ...REQUEST, timeoutSeconds: 1 });

        expect(s.executions.create).toHaveBeenCalledWith(
          expect.objectContaining({
            startedAt: new Date(`2026-10-14T${startedAt}`),
            deadlineAt: new Date(`2026-10-14T${deadlineAt}`),
          })
        );
      }
    );

    it('starts the clock at insert and sets the deadline from the timeout', async () => {
      const s = setup();

      await s.service.insertRunning(REQUEST);

      expect(s.executions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PluginActionExecutionStatus.RUNNING,
          startedAt: NOW,
          deadlineAt: new Date(NOW.getTime() + 60_000),
          tokenHash: 'a'.repeat(64),
          input: { documentId: 'd1' },
          trigger: 'frontend',
          scheduleId: null,
          queuedAt: null,
        })
      );
    });
  });

  describe('insertScheduled', () => {
    it('starts a run within the limits and points the schedule at it', async () => {
      const s = setup();

      await expect(s.service.insertScheduled(SCHEDULED)).resolves.toEqual({
        execution: expect.objectContaining({ id: 'e1' }),
        queued: false,
      });

      expect(s.calls).toEqual(['lock', 'count', 'totals', 'insert', 'schedule']);
      expect(s.executions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PluginActionExecutionStatus.RUNNING,
          trigger: 'schedule',
          scheduleId: 's1',
          tokenHash: 'a'.repeat(64),
          startedAt: NOW,
          deadlineAt: new Date(NOW.getTime() + 60_000),
          queuedAt: null,
        })
      );
      expect(s.schedules.update).toHaveBeenCalledWith(
        { id: 's1', status: TriggerStatus.PROCESSING, version: 3 },
        { lastExecutionId: 'e1', version: expect.any(Function) }
      );
      expect(s.schedules.update.mock.calls[0][1].version()).toBe('version');
    });

    it('refuses with an optimistic-lock error when the runner no longer holds the schedule', async () => {
      const s = setup({ scheduleUpdated: 0 });

      const error = await s.service.insertScheduled(SCHEDULED).catch((refusal: unknown) => refusal);

      expect(error).toBeInstanceOf(QueryFailedError);
      expect((error as QueryFailedError).message).toContain('optimistic lock');
      expect(s.calls).toEqual(['lock', 'count', 'totals', 'insert', 'schedule']);
    });

    it.each([
      ['five running executions', { running: 5 }, ['lock', 'count', 'insert', 'schedule']],
      [
        'the per-minute limit',
        { totals: { perMinute: '60', perDay: '60', bytes: '0' } },
        ['lock', 'count', 'totals', 'insert', 'schedule'],
      ],
      [
        'the per-day limit',
        { totals: { perMinute: 0, perDay: '5000', bytes: '0' } },
        ['lock', 'count', 'totals', 'insert', 'schedule'],
      ],
      [
        'the stored-bytes limit',
        { totals: { perMinute: 0, perDay: 0, bytes: String(100 * 1024 * 1024) } },
        ['lock', 'count', 'totals', 'insert', 'schedule'],
      ],
    ])(
      'queues the run when it meets %s, with no token or clock',
      async (_limit, options, calls) => {
        const s = setup(options);

        await expect(s.service.insertScheduled(SCHEDULED)).resolves.toMatchObject({
          queued: true,
        });

        expect(s.calls).toEqual(calls);
        expect(s.executions.create).toHaveBeenCalledWith(
          expect.objectContaining({
            status: PluginActionExecutionStatus.QUEUED,
            trigger: 'schedule',
            scheduleId: 's1',
            tokenHash: null,
            startedAt: null,
            deadlineAt: null,
            queuedAt: NOW,
            input: { documentId: 'd1' },
            payloadBytes: REQUEST.inputBytes,
          })
        );
        expect(s.schedules.update).toHaveBeenCalledWith(
          { id: 's1', status: TriggerStatus.PROCESSING, version: 3 },
          expect.objectContaining({ lastExecutionId: 'e1' })
        );
      }
    );

    it('refuses an uninstalled installation and leaves the schedule alone', async () => {
      const s = setup({ locked: 0 });

      await expect(s.service.insertScheduled(SCHEDULED)).rejects.toBeInstanceOf(
        InstallationInactiveError
      );
      expect(s.calls).toEqual(['lock']);
      expect(s.schedules.update).not.toHaveBeenCalled();
    });
  });

  describe('promote', () => {
    const PROMOTION: PromoteQueuedExecutionInput = {
      id: 'e1',
      installationId: 'i1',
      pluginVersionId: 'v2',
      role: 'viewer',
      tokenHash: 'b'.repeat(64),
      timeoutSeconds: 1,
    };

    it('moves the row from QUEUED to RUNNING under the lock, in whole seconds', async () => {
      jest.setSystemTime(new Date('2026-10-14T12:00:00.750Z'));
      const s = setup();

      const outcome = await s.service.promote(PROMOTION);

      expect(s.calls).toEqual(['lock', 'count', 'totals', 'update']);
      expect(s.lockQuery.where).toHaveBeenCalledWith('id = :id', { id: 'i1' });
      expect(s.executions.update).toHaveBeenCalledWith(
        { id: 'e1', installationId: 'i1', status: PluginActionExecutionStatus.QUEUED },
        {
          status: PluginActionExecutionStatus.RUNNING,
          tokenHash: 'b'.repeat(64),
          role: 'viewer',
          pluginVersionId: 'v2',
          startedAt: new Date('2026-10-14T12:00:00.000Z'),
          deadlineAt: new Date('2026-10-14T12:00:02.000Z'),
        }
      );
      expect(s.executions.findOneByOrFail).toHaveBeenCalledWith({ id: 'e1' });
      expect(outcome).toEqual({
        outcome: 'STARTED',
        execution: { id: 'e1', status: PluginActionExecutionStatus.RUNNING },
      });
    });

    it.each([
      ['five running executions', { running: 5 }],
      ['the per-minute limit', { totals: { perMinute: '60', perDay: '60', bytes: '0' } }],
    ])('waits when it meets %s, leaving the row QUEUED', async (_limit, options) => {
      const s = setup(options);

      await expect(s.service.promote(PROMOTION)).resolves.toEqual({ outcome: 'WAIT' });
      expect(s.executions.update).not.toHaveBeenCalled();
    });

    it.each([
      ['five running executions', { running: 5 }, true, ['count']],
      [
        'the per-minute limit',
        { totals: { perMinute: '60', perDay: '60', bytes: '0' } },
        true,
        ['count', 'totals'],
      ],
      ['no limit', {}, false, ['count', 'totals']],
    ])(
      'answers whether a start would meet %s, as promote counts, without the lock',
      async (_limit, options, refused, calls) => {
        const s = setup(options);

        await expect(s.service.refusesStart('i1')).resolves.toBe(refused);
        expect(s.calls).toEqual(calls);
        expect(s.executions.countBy).toHaveBeenCalledWith({
          installationId: 'i1',
          status: PluginActionExecutionStatus.RUNNING,
          deadlineAt: MoreThan(NOW),
        });
      }
    );

    it('answers GONE when a cancel or another promoter moved the row first', async () => {
      const s = setup({ updated: 0 });

      await expect(s.service.promote(PROMOTION)).resolves.toEqual({ outcome: 'GONE' });
      expect(s.executions.findOneByOrFail).not.toHaveBeenCalled();
    });

    it('refuses an uninstalled installation before it counts', async () => {
      const s = setup({ locked: 0 });

      await expect(s.service.promote(PROMOTION)).rejects.toBeInstanceOf(InstallationInactiveError);
      expect(s.calls).toEqual(['lock']);
    });
  });

  it('finishes only an execution that is still RUNNING', async () => {
    const s = setup();

    await s.service.finish('e1', {
      status: PluginActionExecutionStatus.FAILED,
      errorCode: 'DOC_LOCKED',
      errorMessage: 'Locked',
    });

    expect(s.executions.update).toHaveBeenCalledWith(
      { id: 'e1', status: PluginActionExecutionStatus.RUNNING },
      {
        status: PluginActionExecutionStatus.FAILED,
        finishedAt: NOW,
        errorCode: 'DOC_LOCKED',
        errorMessage: 'Locked',
        result: null,
      }
    );
  });

  it('adds the byte length of a result to payloadBytes when the execution succeeds', async () => {
    const s = setup();

    await s.service.finish('e1', { status: PluginActionExecutionStatus.SUCCEEDED, result: 'é' });

    const values = s.executions.update.mock.calls[0][1];
    expect(values.payloadBytes()).toBe('payloadBytes + 4');
  });

  it('reports a lost compare-and-set as false', async () => {
    const s = setup();
    s.executions.update.mockResolvedValue({ affected: 0 });

    await expect(
      s.service.finish('e1', { status: PluginActionExecutionStatus.SUCCEEDED, result: 1 })
    ).resolves.toBe(false);
  });

  it('cancels only a RUNNING or QUEUED execution of the same installation', async () => {
    const s = setup();

    await expect(s.service.cancel('e1', 'i1')).resolves.toBe(true);

    expect(s.executions.update).toHaveBeenCalledWith(
      {
        id: 'e1',
        installationId: 'i1',
        status: In([PluginActionExecutionStatus.RUNNING, PluginActionExecutionStatus.QUEUED]),
      },
      {
        status: PluginActionExecutionStatus.CANCELLED,
        finishedAt: NOW,
        errorMessage: 'The execution was cancelled',
      }
    );
  });

  describe('queue', () => {
    it('finds an open execution of a schedule, QUEUED or RUNNING', async () => {
      const s = setup();
      s.executions.existsBy.mockResolvedValue(true);

      await expect(s.service.hasOpenForSchedule('s1')).resolves.toBe(true);

      expect(s.executions.existsBy).toHaveBeenCalledWith({
        scheduleId: 's1',
        status: In([PluginActionExecutionStatus.QUEUED, PluginActionExecutionStatus.RUNNING]),
      });
    });

    it('reads the oldest queued execution of an installation, input included', async () => {
      const s = setup();

      await s.service.findOldestQueued('i1');

      expect(s.executions.findOne).toHaveBeenCalledWith({
        where: { installationId: 'i1', status: PluginActionExecutionStatus.QUEUED },
        order: { queuedAt: 'ASC', id: 'ASC' },
      });
    });

    it('lists the distinct installations with a queued execution in id order, up to the limit', async () => {
      const s = setup();
      s.totalsQuery.getRawMany.mockResolvedValue([
        { installationId: 'i1' },
        { installationId: 'i2' },
      ]);

      await expect(s.service.findInstallationsWithQueued(500)).resolves.toEqual(['i1', 'i2']);

      expect(s.totalsQuery.select).toHaveBeenCalledWith('e.installationId', 'installationId');
      expect(s.totalsQuery.distinct).toHaveBeenCalledWith(true);
      expect(s.totalsQuery.where).toHaveBeenCalledWith('e.status = :status', {
        status: PluginActionExecutionStatus.QUEUED,
      });
      expect(s.totalsQuery.orderBy).toHaveBeenCalledWith('e.installationId', 'ASC');
      expect(s.totalsQuery.limit).toHaveBeenCalledWith(500);
      expect(s.totalsQuery.andWhere).not.toHaveBeenCalled();
    });

    it('lists the next page after the last installation of the previous one', async () => {
      const s = setup();

      await s.service.findInstallationsWithQueued(500, 'i2');

      expect(s.totalsQuery.andWhere).toHaveBeenCalledWith('e.installationId > :after', {
        after: 'i2',
      });
      expect(s.totalsQuery.orderBy).toHaveBeenCalledWith('e.installationId', 'ASC');
    });

    it('fails only an execution that is still QUEUED', async () => {
      const s = setup();

      await expect(
        s.service.failQueued('e1', 'OWNER_NOT_MEMBER', 'The owner is no longer a project member')
      ).resolves.toBe(true);

      expect(s.executions.update).toHaveBeenCalledWith(
        { id: 'e1', status: PluginActionExecutionStatus.QUEUED },
        {
          status: PluginActionExecutionStatus.FAILED,
          finishedAt: NOW,
          errorCode: 'OWNER_NOT_MEMBER',
          errorMessage: 'The owner is no longer a project member',
        }
      );
    });

    it('reports a failQueued that lost its compare-and-set as false', async () => {
      const s = setup({ updated: 0 });

      await expect(s.service.failQueued('e1', 'INVALID_INPUT', 'No longer valid')).resolves.toBe(
        false
      );
    });

    it("cancels a schedule's queued execution and counts what it cancelled", async () => {
      const s = setup({ updated: 1 });

      await expect(s.service.cancelQueuedForSchedule('s1')).resolves.toBe(1);

      expect(s.executions.update).toHaveBeenCalledWith(
        { scheduleId: 's1', status: PluginActionExecutionStatus.QUEUED },
        {
          status: PluginActionExecutionStatus.CANCELLED,
          finishedAt: NOW,
          errorMessage: 'The schedule was changed, paused or deleted',
        }
      );
    });

    it("cancels an installation's queued executions and counts what it cancelled", async () => {
      const s = setup({ updated: 2 });

      await expect(s.service.cancelQueuedForInstallation('i1')).resolves.toBe(2);

      expect(s.executions.update).toHaveBeenCalledWith(
        { installationId: 'i1', status: PluginActionExecutionStatus.QUEUED },
        {
          status: PluginActionExecutionStatus.CANCELLED,
          finishedAt: NOW,
          errorMessage: 'The plugin was uninstalled',
        }
      );
    });

    it('reads the last runs of several executions in one query, without input, result or message', async () => {
      const s = setup();

      await s.service.findLastRuns(['e1', 'e2']);

      expect(s.executions.find).toHaveBeenCalledWith({
        select: { id: true, status: true, errorCode: true, finishedAt: true },
        where: { id: In(['e1', 'e2']) },
      });
    });
  });

  describe('reads', () => {
    it('looks a token up by its hash, reading only the columns auth needs', async () => {
      const s = setup();

      await s.service.findRunningByTokenHash('h'.repeat(64), NOW);

      expect(s.executions.findOne).toHaveBeenCalledWith({
        select: {
          id: true,
          pluginId: true,
          installationId: true,
          projectId: true,
          userId: true,
          role: true,
        },
        where: {
          tokenHash: 'h'.repeat(64),
          status: PluginActionExecutionStatus.RUNNING,
          deadlineAt: MoreThan(NOW),
        },
      });
    });

    it('reads an execution for its view without the input', async () => {
      const s = setup();

      await s.service.findById('e1');

      const [options] = s.executions.findOne.mock.calls[0] as [
        { where: object; select: Record<string, boolean> },
      ];
      expect(options.where).toEqual({ id: 'e1' });
      expect(Object.keys(options.select).sort()).toEqual(
        [
          'action',
          'deadlineAt',
          'errorCode',
          'errorMessage',
          'finishedAt',
          'id',
          'installationId',
          'result',
          'scheduleId',
          'startedAt',
          'status',
          'trigger',
        ].sort()
      );
    });
  });

  describe('retention', () => {
    const CUTOFF = new Date('2026-10-13T12:00:00.000Z');
    const rows = (count: number, errorCode: string | null = null) =>
      Array.from({ length: count }, (_, index) => ({ id: `e${index}`, errorCode }));

    it('times out QUEUED rows queued before the cutoff and counts them', async () => {
      const s = setup({ updated: 2 });

      await expect(s.service.timeOutQueued(CUTOFF)).resolves.toBe(2);

      expect(s.executions.update).toHaveBeenCalledWith(
        { status: PluginActionExecutionStatus.QUEUED, queuedAt: LessThan(CUTOFF) },
        {
          status: PluginActionExecutionStatus.TIMED_OUT,
          finishedAt: NOW,
          errorMessage: 'The run waited 24 hours in the queue',
        }
      );
    });

    it('clears only rows not cleared yet, and marks the rows it clears', async () => {
      const s = setup();
      s.executions.find.mockResolvedValueOnce(rows(1));

      await expect(s.service.clearPayloads(CUTOFF)).resolves.toBe(1);

      expect(s.executions.find).toHaveBeenCalledWith({
        select: { id: true, errorCode: true },
        where: { payloadsClearedAt: IsNull(), finishedAt: LessThan(CUTOFF) },
        take: 500,
      });
      expect(s.executions.update).toHaveBeenCalledTimes(1);
      const [criteria, values] = s.executions.update.mock.calls[0];
      expect(criteria).toEqual({ id: In(['e0']) });
      expect(values).toEqual({
        input: expect.any(Function),
        result: expect.any(Function),
        payloadsClearedAt: NOW,
        payloadBytes: 0,
      });
      expect(values.input()).toBe('NULL');
      expect(values.result()).toBe('NULL');
    });

    it('clears payloads in batches of 500 until a short batch', async () => {
      const s = setup();
      s.executions.find.mockResolvedValueOnce(rows(500)).mockResolvedValueOnce(rows(1));

      await expect(s.service.clearPayloads(CUTOFF)).resolves.toBe(501);

      expect(s.executions.find).toHaveBeenCalledTimes(2);
      expect(s.executions.update).toHaveBeenCalledTimes(2);
    });

    it('stops clearing between batches once aborted', async () => {
      const s = setup();
      const controller = new AbortController();
      s.executions.find.mockResolvedValue(rows(500));
      s.executions.update.mockImplementationOnce(async () => {
        controller.abort();
        return { affected: 500 };
      });

      await expect(s.service.clearPayloads(CUTOFF, controller.signal)).resolves.toBe(500);

      expect(s.executions.find).toHaveBeenCalledTimes(1);
    });

    it("clears the message of a plugin-authored failure and keeps OWOX's own", async () => {
      const s = setup();
      s.executions.find.mockResolvedValueOnce([
        { id: 'plugin', errorCode: 'DOC_LOCKED' },
        { id: 'backend', errorCode: 'BACKEND_UNREACHABLE' },
        { id: 'reserved', errorCode: 'PLUGIN_SUSPENDED' },
        { id: 'none', errorCode: null },
      ]);

      await s.service.clearPayloads(CUTOFF);

      expect(s.executions.update).toHaveBeenCalledTimes(2);
      expect(s.executions.update).toHaveBeenCalledWith(
        { id: In(['plugin']) },
        { errorMessage: null }
      );
      expect(s.executions.update).toHaveBeenLastCalledWith(
        { id: In(['plugin', 'backend', 'reserved', 'none']) },
        expect.objectContaining({ payloadsClearedAt: NOW })
      );
    });

    it('deletes old rows in batches of 500 until a short batch', async () => {
      const s = setup();
      s.executions.find.mockResolvedValueOnce(rows(500)).mockResolvedValueOnce(rows(2));
      const cutoff = new Date('2026-07-16T12:00:00.000Z');

      await expect(s.service.deleteFinished(cutoff)).resolves.toBe(502);

      expect(s.executions.find).toHaveBeenCalledWith({
        select: { id: true },
        where: { finishedAt: LessThan(cutoff) },
        take: 500,
      });
      expect(s.executions.delete).toHaveBeenCalledTimes(2);
      expect(s.executions.delete).toHaveBeenLastCalledWith({ id: In(['e0', 'e1']) });
    });

    it('stops deleting between batches once aborted', async () => {
      const s = setup();
      const controller = new AbortController();
      s.executions.find.mockResolvedValue(rows(500));
      s.executions.delete.mockImplementationOnce(async () => {
        controller.abort();
        return { affected: 500 };
      });

      await expect(s.service.deleteFinished(CUTOFF, controller.signal)).resolves.toBe(500);

      expect(s.executions.find).toHaveBeenCalledTimes(1);
    });
  });
});
