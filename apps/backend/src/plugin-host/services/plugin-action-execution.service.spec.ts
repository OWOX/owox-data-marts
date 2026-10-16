jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { In, IsNull, LessThan, MoreThan } from 'typeorm';
import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import { InstallationInactiveError, TooManyExecutionsError } from '../errors/plugin-action.errors';
import {
  InsertRunningExecutionInput,
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

type Totals = {
  perMinute: string | number | null;
  perDay: string | number | null;
  bytes: string | number | null;
};

function setup(options: { locked?: number; running?: number; totals?: Totals } = {}) {
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
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(async () => {
      calls.push('totals');
      return options.totals ?? { perMinute: '0', perDay: '0', bytes: null };
    }),
  };
  const executions = {
    createQueryBuilder: jest.fn(() => totalsQuery),
    countBy: jest.fn(async () => {
      calls.push('count');
      return options.running ?? 0;
    }),
    create: jest.fn((row: object) => row),
    save: jest.fn(async (row: object) => {
      calls.push('insert');
      return { id: 'e1', ...row };
    }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };
  const service = new PluginActionExecutionService(executions as never, installations as never);
  return { service, calls, lockQuery, executions, totalsQuery };
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
      ['per minute', { perMinute: '60', perDay: '60', bytes: '0' }, '60 starts per minute reached'],
      ['per day', { perMinute: 3, perDay: '5000', bytes: '0' }, '5000 starts per day reached'],
      [
        'in stored bytes',
        { perMinute: 0, perDay: 0, bytes: String(100 * 1024 * 1024) },
        '100 MiB of stored payloads reached',
      ],
    ])(
      'refuses a start over the limit %s, naming it and leaving the input out',
      async (_n, totals, message) => {
        const s = setup({ totals });

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
        })
      );
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

  it('cancels only a RUNNING execution of the same installation', async () => {
    const s = setup();

    await expect(s.service.cancel('e1', 'i1')).resolves.toBe(true);

    expect(s.executions.update).toHaveBeenCalledWith(
      { id: 'e1', installationId: 'i1', status: PluginActionExecutionStatus.RUNNING },
      {
        status: PluginActionExecutionStatus.CANCELLED,
        finishedAt: NOW,
        errorMessage: 'The execution was cancelled',
      }
    );
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
