import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource, QueryFailedError, Table } from 'typeorm';
import {
  addTransactionalDataSource,
  initializeTransactionalContext,
  StorageDriver,
} from 'typeorm-transactional';
import { TriggerStatus } from 'src/common/scheduler/shared/entities/trigger-status';
import { CreatePluginActionExecution1790900000001 } from 'src/migrations/1790900000001-create-plugin-action-execution';
import { CreatePluginActionSchedule1791100000000 } from 'src/migrations/1791100000000-create-plugin-action-schedule';
import { AddPluginActionExecutionListIndexes1791200000000 } from 'src/migrations/1791200000000-add-plugin-action-execution-list-indexes';
import { PluginActionExecution } from 'src/plugin-host/entities/plugin-action-execution.entity';
import { PluginActionSchedule } from 'src/plugin-host/entities/plugin-action-schedule.entity';
import { PluginInstallation } from 'src/plugin-host/entities/plugin-installation.entity';
import { PluginActionExecutionStatus } from 'src/plugin-host/enums/plugin-action-execution-status.enum';
import type { PluginRunCursor, PluginRunFilter } from 'src/plugin-host/dto/domain/plugin-run.dto';
import {
  InstallationInactiveError,
  TooManyExecutionsError,
} from 'src/plugin-host/errors/plugin-action.errors';
import { TooManySchedulesError } from 'src/plugin-host/errors/plugin-schedule.errors';
import {
  InsertRunningExecutionInput,
  PluginActionExecutionService,
} from 'src/plugin-host/services/plugin-action-execution.service';
import { PluginActionScheduleService } from 'src/plugin-host/services/plugin-action-schedule.service';
import { lockActiveInstallation } from 'src/plugin-host/utils/installation-lock.util';
import { createExecutionToken } from 'src/plugin-host/utils/execution-token.util';
import { classifyBackendResponse } from 'src/plugin-host/utils/plugin-action-outcome.util';

const MYSQL_HOST = process.env.PLUGIN_ACTIONS_MYSQL_HOST;
const MYSQL_PORT = parseInt(process.env.PLUGIN_ACTIONS_MYSQL_PORT ?? '3306', 10);
const MYSQL_USER = process.env.PLUGIN_ACTIONS_MYSQL_USER ?? 'root';
const MYSQL_PASSWORD = process.env.PLUGIN_ACTIONS_MYSQL_PASSWORD;
const MYSQL_DATABASE = process.env.PLUGIN_ACTIONS_MYSQL_DATABASE ?? 'owox_test';

const available = !!MYSQL_HOST;
if (!available) {
  console.log(
    'Skipping plugin action execution MySQL integration tests: PLUGIN_ACTIONS_MYSQL_HOST unset'
  );
}
if (available && !MYSQL_PASSWORD) {
  throw new Error('PLUGIN_ACTIONS_MYSQL_HOST is set but PLUGIN_ACTIONS_MYSQL_PASSWORD is empty.');
}

const describeIfAvailable = available ? describe : describe.skip;

const TABLES = [
  'plugin_action_schedule',
  'plugin_action_execution',
  'plugin_installation',
  'migrations',
];
const HOUR = 60 * 60 * 1000;

function nested(depth: number): unknown {
  let value: unknown = [];
  for (let level = 1; level < depth; level += 1) value = [value];
  return value;
}

describeIfAvailable('Plugin action execution storage (integration, MySQL)', () => {
  let dataSource: DataSource;
  let service: PluginActionExecutionService;

  beforeAll(async () => {
    initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });
    dataSource = new DataSource({
      type: 'mysql',
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      username: MYSQL_USER,
      password: MYSQL_PASSWORD!,
      database: MYSQL_DATABASE,
      entities: [PluginActionExecution, PluginInstallation, PluginActionSchedule],
      migrations: [
        CreatePluginActionExecution1790900000001,
        CreatePluginActionSchedule1791100000000,
        AddPluginActionExecutionListIndexes1791200000000,
      ],
      migrationsTransactionMode: 'none',
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    for (const table of TABLES) {
      await dataSource.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
    // An older migration owns plugin_installation; the start lock reads only these columns.
    const runner = dataSource.createQueryRunner();
    try {
      await runner.createTable(
        new Table({
          name: 'plugin_installation',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'uninstalledAt', type: 'datetime', isNullable: true },
            { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          ],
        })
      );
    } finally {
      await runner.release();
    }
    await dataSource.runMigrations({ transaction: 'none' });
    addTransactionalDataSource(dataSource);
    service = new PluginActionExecutionService(
      dataSource.getRepository(PluginActionExecution),
      dataSource.getRepository(PluginInstallation),
      dataSource.getRepository(PluginActionSchedule)
    );
  }, 60_000);

  afterEach(async () => {
    await dataSource.query('DELETE FROM plugin_action_execution');
    await dataSource.query('DELETE FROM plugin_action_schedule');
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      for (const table of TABLES) {
        await dataSource.query(`DROP TABLE IF EXISTS \`${table}\``).catch(() => undefined);
      }
      await dataSource.destroy();
    }
  }, 30_000);

  async function payloadColumnTypes(): Promise<Record<string, string>> {
    const columns: { COLUMN_NAME: string; DATA_TYPE: string }[] = await dataSource.query(
      `SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'plugin_action_execution'
         AND COLUMN_NAME IN ('input', 'result')`,
      [MYSQL_DATABASE]
    );
    return Object.fromEntries(columns.map(column => [column.COLUMN_NAME, column.DATA_TYPE]));
  }

  async function installation(): Promise<string> {
    const id = randomUUID();
    await dataSource.query('INSERT INTO plugin_installation (id) VALUES (?)', [id]);
    return id;
  }

  /** A paused schedule saved PROCESSING as the runner saves it, with the version that save leaves on it. */
  async function held(installationId: string) {
    const schedules = dataSource.getRepository(PluginActionSchedule);
    const schedule = await schedules.save(
      schedules.create({
        pluginId: randomUUID(),
        installationId,
        projectId: 'project-1',
        action: 'update-document',
        parameters: null,
        name: null,
        cronExpression: '0 9 * * *',
        timeZone: 'UTC',
        isActive: false,
        nextRunTimestamp: null,
        lastRunTimestamp: null,
        disabledReason: null,
        lastExecutionId: null,
      })
    );
    schedule.status = TriggerStatus.PROCESSING;
    await schedules.save(schedule);
    return { scheduleId: schedule.id, scheduleVersion: schedule.version };
  }

  async function indexColumns(table: string, index: string): Promise<string[]> {
    const rows: { COLUMN_NAME: string }[] = await dataSource.query(
      `SELECT COLUMN_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
       ORDER BY SEQ_IN_INDEX`,
      [MYSQL_DATABASE, table, index]
    );
    return rows.map(row => row.COLUMN_NAME);
  }

  function running(installationId: string, timeoutSeconds = 60): InsertRunningExecutionInput {
    return {
      pluginId: randomUUID(),
      pluginVersionId: randomUUID(),
      installationId,
      projectId: 'project-1',
      userId: 'user-1',
      action: 'update-document',
      input: { documentId: 'd1' },
      inputBytes: Buffer.byteLength('{"documentId":"d1"}'),
      role: 'editor',
      timeoutSeconds,
      tokenHash: createExecutionToken().tokenHash,
      trigger: 'frontend',
    };
  }

  it('creates the table through its migration', async () => {
    const applied: { name: string }[] = await dataSource.query(
      'SELECT name FROM migrations ORDER BY id'
    );
    expect(applied.map(row => row.name)).toEqual([
      'CreatePluginActionExecution1790900000001',
      'CreatePluginActionSchedule1791100000000',
      'AddPluginActionExecutionListIndexes1791200000000',
    ]);
    const index: { COLUMN_NAME: string }[] = await dataSource.query(
      `SELECT COLUMN_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'plugin_action_execution'
         AND INDEX_NAME = 'idx_plugin_action_execution_payloads'
       ORDER BY SEQ_IN_INDEX`,
      [MYSQL_DATABASE]
    );
    expect(index.map(row => row.COLUMN_NAME)).toEqual(['payloadsClearedAt', 'finishedAt']);
    await expect(payloadColumnTypes()).resolves.toEqual({
      input: 'mediumtext',
      result: 'mediumtext',
    });
  });

  it('creates the schedule table and the queue indexes through their migration', async () => {
    await expect(
      indexColumns('plugin_action_schedule', 'idx_plugin_action_schedule_ready')
    ).resolves.toEqual(['isActive', 'status', 'nextRunTimestamp']);
    await expect(
      indexColumns('plugin_action_schedule', 'idx_plugin_action_schedule_installation')
    ).resolves.toEqual(['installationId']);
    await expect(
      indexColumns('plugin_action_execution', 'idx_plugin_action_execution_schedule')
    ).resolves.toEqual(['scheduleId', 'status']);
    await expect(
      indexColumns('plugin_action_execution', 'idx_plugin_action_execution_queue')
    ).resolves.toEqual(['installationId', 'status', 'queuedAt']);
    const columns: { DATA_TYPE: string }[] = await dataSource.query(
      `SELECT DATA_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'plugin_action_schedule'
         AND COLUMN_NAME = 'parameters'`,
      [MYSQL_DATABASE]
    );
    expect(columns.map(column => column.DATA_TYPE)).toEqual(['mediumtext']);
  });

  it('pages runs newest first through rows that share a second, on the list indexes', async () => {
    await expect(
      indexColumns('plugin_action_execution', 'idx_plugin_action_execution_project_created')
    ).resolves.toEqual(['projectId', 'createdAt']);
    await expect(
      indexColumns('plugin_action_execution', 'idx_plugin_action_execution_project_user_created')
    ).resolves.toEqual(['projectId', 'userId', 'createdAt']);
    await expect(
      indexColumns('plugin_action_execution', 'idx_plugin_action_execution_schedule_created')
    ).resolves.toEqual(['scheduleId', 'createdAt']);
    const projectId = `runs-${randomUUID()}`;
    const executions = dataSource.getRepository(PluginActionExecution);
    const runAt = async (createdAt: string, userId = 'user-1'): Promise<string> => {
      const saved = await executions.save(
        executions.create({
          pluginId: randomUUID(),
          pluginVersionId: randomUUID(),
          installationId: randomUUID(),
          projectId,
          userId,
          action: 'update-document',
          input: null,
          trigger: 'frontend',
          status: PluginActionExecutionStatus.SUCCEEDED,
          role: 'editor',
          tokenHash: null,
          result: null,
        })
      );
      await dataSource.query('UPDATE plugin_action_execution SET createdAt = ? WHERE id = ?', [
        createdAt,
        saved.id,
      ]);
      return saved.id;
    };
    const tied: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      tied.push(await runAt('2026-10-17 10:00:00'));
    }
    const theirs = await runAt('2026-10-17 10:00:00', 'user-2');
    const newest = await runAt('2026-10-17 10:00:01');
    const filter = (userId: string | null): PluginRunFilter => ({
      statuses: [],
      trigger: null,
      pluginId: null,
      scheduleId: null,
      userId,
    });
    const allPages = async (userId: string | null): Promise<string[]> => {
      const seen: string[] = [];
      let after: PluginRunCursor | null = null;
      for (;;) {
        const page = await service.listRuns(projectId, filter(userId), after, 2);
        seen.push(...page.map(row => row.id));
        if (page.length < 2) {
          return seen;
        }
        const last = page[page.length - 1];
        after = { createdAt: last.createdAt, id: last.id };
      }
    };

    // A member's pages filter by owner, an admin's do not.
    await expect(allPages('user-1')).resolves.toEqual([newest, ...[...tied].sort().reverse()]);
    await expect(allPages(null)).resolves.toEqual([newest, ...[...tied, theirs].sort().reverse()]);
  });

  it('stores 64 KiB of schedule parameters, one byte more than a text column holds', async () => {
    const schedules = dataSource.getRepository(PluginActionSchedule);
    const parameters = { text: 'x'.repeat(64 * 1024 - Buffer.byteLength('{"text":""}')) };
    expect(Buffer.byteLength(JSON.stringify(parameters))).toBe(64 * 1024);

    const saved = await schedules.save(
      schedules.create({
        pluginId: randomUUID(),
        installationId: randomUUID(),
        projectId: 'project-1',
        action: 'update-document',
        parameters,
        name: null,
        cronExpression: '0 9 * * *',
        timeZone: 'Europe/Kyiv',
        isActive: true,
        nextRunTimestamp: new Date('2026-10-17T06:00:00.000Z'),
        lastRunTimestamp: null,
        disabledReason: null,
        lastExecutionId: null,
      })
    );

    const loaded = await schedules.findOneByOrFail({ id: saved.id });
    expect(loaded.parameters).toEqual(parameters);
    expect(loaded).toMatchObject({ status: 'IDLE', version: 1, isActive: true });
  });

  it('gives a slot back only to the stranded schedule of an active installation', async () => {
    const schedules = dataSource.getRepository(PluginActionSchedule);
    const uninstalled = await installation();
    await dataSource.query('UPDATE plugin_installation SET uninstalledAt = NOW() WHERE id = ?', [
      uninstalled,
    ]);
    const stranded = (id: string, installationId: string) =>
      schedules.save(
        schedules.create({
          id,
          pluginId: randomUUID(),
          installationId,
          projectId: 'project-1',
          action: 'update-document',
          parameters: null,
          name: null,
          cronExpression: '0 9 * * *',
          timeZone: 'Europe/Kyiv',
          isActive: true,
          nextRunTimestamp: null,
          lastRunTimestamp: null,
          disabledReason: null,
          lastExecutionId: null,
        })
      );
    // The parked row sorts first, so a LIMIT applied before the join would pick it.
    const parked = await stranded('00000000-0000-4000-8000-000000000001', uninstalled);
    const kept = await stranded('00000000-0000-4000-8000-000000000002', await installation());
    const scheduleService = new PluginActionScheduleService(
      schedules,
      dataSource.getRepository(PluginInstallation),
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never
    );

    await expect(
      scheduleService.unparkStranded(new Date('2026-10-17T12:00:00.000Z'), 1)
    ).resolves.toBe(1);

    await expect(schedules.findOneByOrFail({ id: kept.id })).resolves.toMatchObject({
      nextRunTimestamp: new Date('2026-10-18T06:00:00.000Z'),
      version: 2,
    });
    await expect(schedules.findOneByOrFail({ id: parked.id })).resolves.toMatchObject({
      nextRunTimestamp: null,
      version: 1,
    });
  });

  it('lets exactly five of seven concurrent starts win', async () => {
    const installationId = await installation();

    const results = await Promise.allSettled(
      Array.from({ length: 7 }, () => service.insertRunning(running(installationId)))
    );

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(5);
    expect(
      results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map(result => result.reason)
    ).toEqual([expect.any(TooManyExecutionsError), expect.any(TooManyExecutionsError)]);
    expect(
      await dataSource.getRepository(PluginActionExecution).countBy({
        installationId,
        status: PluginActionExecutionStatus.RUNNING,
      })
    ).toBe(5);
  });

  it('refuses the 61st start within a minute, whatever the status of the earlier ones', async () => {
    const installationId = await installation();
    for (let started = 0; started < 59; started += 1) {
      const row = await service.insertRunning(running(installationId));
      await service.cancel(row.id, installationId);
    }

    await expect(service.insertRunning(running(installationId))).resolves.toBeDefined();
    await expect(service.insertRunning(running(installationId))).rejects.toThrow(
      '60 starts per minute reached'
    );
  });

  it('refuses a start once stored payloads reach 100 MiB', async () => {
    const installationId = await installation();
    const saved = await service.insertRunning(running(installationId));
    await dataSource
      .getRepository(PluginActionExecution)
      .update(saved.id, { payloadBytes: 100 * 1024 * 1024 });

    await expect(service.insertRunning(running(installationId))).rejects.toThrow(
      '100 MiB of stored payloads reached'
    );
  });

  it('stores a whole-second start and a deadline at least the timeout away', async () => {
    const installationId = await installation();

    const before = Date.now();
    const saved = await service.insertRunning(running(installationId, 30));
    const after = Date.now();

    const loaded = await dataSource
      .getRepository(PluginActionExecution)
      .findOneByOrFail({ id: saved.id });
    expect(loaded.startedAt?.getTime()).toBe(saved.startedAt?.getTime());
    expect(loaded.deadlineAt?.getTime()).toBe(saved.deadlineAt?.getTime());
    expect(loaded.startedAt!.getMilliseconds()).toBe(0);
    expect(loaded.deadlineAt!.getMilliseconds()).toBe(0);
    expect(loaded.deadlineAt!.getTime()).toBeGreaterThanOrEqual(before + 30_000);
    expect(loaded.deadlineAt!.getTime()).toBeLessThan(after + 31_000);
  });

  it('stores a normal result, and one nested 100 levels deep', async () => {
    const installationId = await installation();
    const normal = await service.insertRunning(running(installationId));
    const deep = await service.insertRunning(running(installationId));
    const result = { count: 3, rows: [{ id: 'a', tags: ['x'] }], note: 'ünïcødé 😀' };

    await expect(
      service.finish(normal.id, { status: PluginActionExecutionStatus.SUCCEEDED, result })
    ).resolves.toBe(true);
    await expect(
      service.finish(deep.id, {
        status: PluginActionExecutionStatus.SUCCEEDED,
        result: nested(100),
      })
    ).resolves.toBe(true);

    await expect(service.findById(normal.id)).resolves.toMatchObject({
      status: PluginActionExecutionStatus.SUCCEEDED,
      result,
    });
  });

  it.each(['12345', 'true', '{"a":1}'])(
    'reads the string %s back as a string, as input and as result',
    async text => {
      const saved = await service.insertRunning({
        ...running(await installation()),
        input: text,
      });
      await service.finish(saved.id, {
        status: PluginActionExecutionStatus.SUCCEEDED,
        result: text,
      });

      const loaded = await service.findWithInput(saved.id);
      expect(loaded?.input).toBe(text);
      expect(loaded?.result).toBe(text);
    }
  );

  it('keeps the key order of input and result', async () => {
    const value = { zeta: 1, alpha: { b: 2, a: 1 }, mid: [{ y: 1, x: 2 }] };
    const saved = await service.insertRunning({ ...running(await installation()), input: value });
    await service.finish(saved.id, {
      status: PluginActionExecutionStatus.SUCCEEDED,
      result: value,
    });

    const loaded = await service.findWithInput(saved.id);
    expect(JSON.stringify(loaded?.input)).toBe(JSON.stringify(value));
    expect(JSON.stringify(loaded?.result)).toBe(JSON.stringify(value));
  });

  it('stores a lone surrogate and a key over 65,535 bytes, which a json column refuses', async () => {
    const value = { title: 'abc\ud83d', ['k'.repeat(65_536)]: 1 };
    const saved = await service.insertRunning({ ...running(await installation()), input: value });
    await service.finish(saved.id, {
      status: PluginActionExecutionStatus.SUCCEEDED,
      result: value,
    });

    const loaded = await service.findWithInput(saved.id);
    expect(loaded?.input).toEqual(value);
    expect(loaded?.result).toEqual(value);
  });

  it("stores a result nested 101 levels deep, so the 100-level refusal is the classifier's", async () => {
    expect(classifyBackendResponse(200, JSON.stringify({ result: nested(101) }))).toEqual({
      status: PluginActionExecutionStatus.FAILED,
      errorCode: 'BACKEND_INVALID_RESPONSE',
      errorMessage: 'The result is nested deeper than 100 levels',
    });

    const saved = await service.insertRunning(running(await installation()));
    await expect(
      service.finish(saved.id, {
        status: PluginActionExecutionStatus.SUCCEEDED,
        result: nested(101),
      })
    ).resolves.toBe(true);
    await expect(service.findById(saved.id)).resolves.toMatchObject({ result: nested(101) });
  });

  it('clears payloads and deletes old rows by id', async () => {
    const installationId = await installation();
    const repository = dataSource.getRepository(PluginActionExecution);
    const old = await service.insertRunning(running(installationId));
    await service.finish(old.id, {
      status: PluginActionExecutionStatus.FAILED,
      errorCode: 'DOC_LOCKED',
      errorMessage: 'May echo the input',
    });
    await repository.update(old.id, { finishedAt: new Date(Date.now() - 25 * HOUR) });

    await expect(service.clearPayloads(new Date(Date.now() - 24 * HOUR))).resolves.toBe(1);
    await expect(service.clearPayloads(new Date(Date.now() - 24 * HOUR))).resolves.toBe(0);
    await expect(repository.findOneByOrFail({ id: old.id })).resolves.toMatchObject({
      input: null,
      errorMessage: null,
      payloadsClearedAt: expect.any(Date),
    });

    await expect(service.deleteFinished(new Date(Date.now() - 24 * HOUR))).resolves.toBe(1);
    await expect(repository.countBy({ installationId })).resolves.toBe(0);
  });

  it('starts a queued execution once when two promoters race for it', async () => {
    const installationId = await installation();
    const started: PluginActionExecution[] = [];
    for (let i = 0; i < 5; i += 1) {
      started.push(await service.insertRunning(running(installationId)));
    }
    const { trigger: _frontend, ...request } = running(installationId);
    const { execution, queued } = await service.insertScheduled({
      ...request,
      ...(await held(installationId)),
    });
    expect(queued).toBe(true);
    for (const row of started.slice(0, 2)) {
      await service.finish(row.id, { status: PluginActionExecutionStatus.SUCCEEDED, result: null });
    }

    const outcomes = await Promise.all(
      [1, 2].map(() =>
        service.promote({
          id: execution.id,
          installationId,
          pluginVersionId: randomUUID(),
          role: 'viewer',
          tokenHash: createExecutionToken().tokenHash,
          timeoutSeconds: 30,
        })
      )
    );

    expect(outcomes.map(result => result.outcome).sort()).toEqual(['GONE', 'STARTED']);
    await expect(
      dataSource.getRepository(PluginActionExecution).countBy({
        installationId,
        status: PluginActionExecutionStatus.RUNNING,
      })
    ).resolves.toBe(4);
  });

  it('pages the installations with a queued run one by one, each once, in id order', async () => {
    const targets = [await installation(), await installation(), await installation()];
    for (const installationId of targets) {
      for (let i = 0; i < 5; i += 1) {
        await service.insertRunning(running(installationId));
      }
      const { trigger: _frontend, ...request } = running(installationId);
      // Two queued rows on one installation: DISTINCT must still return it once.
      await service.insertScheduled({ ...request, ...(await held(installationId)) });
      await service.insertScheduled({ ...request, ...(await held(installationId)) });
    }

    const seen: string[] = [];
    let after: string | undefined;
    for (;;) {
      const page = await service.findInstallationsWithQueued(1, after);
      if (page.length === 0) {
        break;
      }
      expect(page).toHaveLength(1);
      seen.push(page[0]);
      after = page[0];
    }

    expect(seen).toEqual([...new Set(seen)].sort());
    expect(seen.filter(id => targets.includes(id))).toEqual([...targets].sort());
    await expect(service.findInstallationsWithQueued(1, seen[seen.length - 1])).resolves.toEqual(
      []
    );
  });

  it('lets exactly one of two concurrent creates take the last schedule slot', async () => {
    const maxSchedulesPerInstallation = 20;
    const installationId = await installation();
    const schedules = dataSource.getRepository(PluginActionSchedule);
    const pluginId = randomUUID();
    for (let index = 0; index < maxSchedulesPerInstallation - 1; index += 1) {
      await schedules.save(
        schedules.create({
          pluginId,
          installationId,
          projectId: 'project-1',
          action: 'update-document',
          parameters: null,
          name: null,
          cronExpression: '0 9 * * *',
          timeZone: 'UTC',
          isActive: true,
          nextRunTimestamp: new Date('2099-01-01T00:00:00.000Z'),
          lastRunTimestamp: null,
          disabledReason: null,
          lastExecutionId: null,
        })
      );
    }
    // The action declares no input schema, so the validator is never reached.
    const scheduleService = new PluginActionScheduleService(
      schedules,
      dataSource.getRepository(PluginInstallation),
      { findById: async () => ({ currentVersionId: 'version-1' }) } as never,
      {
        findById: async () => ({
          id: 'version-1',
          backend: { actions: { 'update-document': { timeoutSeconds: 30 } } },
        }),
      } as never,
      undefined as never,
      undefined as never,
      { maxSchedulesPerInstallation } as never
    );
    const create = () =>
      scheduleService.create(
        { installationId, pluginId, projectId: 'project-1' },
        {
          action: 'update-document',
          parameters: undefined,
          cron: '0 9 * * *',
          timeZone: 'UTC',
          name: null,
        },
        true
      );

    const results = await Promise.allSettled([create(), create()]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const refused = results.filter(result => result.status === 'rejected');
    expect(refused).toHaveLength(1);
    expect(refused[0].reason).toBeInstanceOf(TooManySchedulesError);
    await expect(schedules.countBy({ installationId })).resolves.toBe(maxSchedulesPerInstallation);
  });

  it('refuses to lock an uninstalled installation', async () => {
    const installationId = await installation();
    await dataSource.query('UPDATE plugin_installation SET uninstalledAt = NOW() WHERE id = ?', [
      installationId,
    ]);

    await expect(
      lockActiveInstallation(dataSource.getRepository(PluginInstallation), installationId)
    ).rejects.toBeInstanceOf(InstallationInactiveError);
  });

  describe('the schedule claim a scheduled start checks', () => {
    const executionCount = (scheduleId: string) =>
      dataSource.getRepository(PluginActionExecution).countBy({ scheduleId });

    it('inserts and records the execution when the claim is the schedule version', async () => {
      const installationId = await installation();
      const { trigger: _frontend, ...request } = running(installationId);
      const claim = await held(installationId);

      const { execution } = await service.insertScheduled({ ...request, ...claim });

      await expect(
        dataSource.getRepository(PluginActionSchedule).findOneByOrFail({ id: claim.scheduleId })
      ).resolves.toMatchObject({ lastExecutionId: execution.id, status: TriggerStatus.PROCESSING });
      await expect(executionCount(claim.scheduleId)).resolves.toBe(1);
    });

    it.each([
      [
        'a version that moved on',
        (scheduleId: string) =>
          dataSource.query('UPDATE plugin_action_schedule SET version = version + 1 WHERE id = ?', [
            scheduleId,
          ]),
      ],
      [
        'a schedule that is no longer PROCESSING',
        (scheduleId: string) =>
          dataSource.query('UPDATE plugin_action_schedule SET status = ? WHERE id = ?', [
            TriggerStatus.IDLE,
            scheduleId,
          ]),
      ],
    ])('refuses %s and leaves no execution row', async (_label, change) => {
      const installationId = await installation();
      const { trigger: _frontend, ...request } = running(installationId);
      const claim = await held(installationId);
      await change(claim.scheduleId);

      const attempt = service.insertScheduled({ ...request, ...claim });

      await expect(attempt).rejects.toBeInstanceOf(QueryFailedError);
      await expect(attempt).rejects.toThrow(/optimistic lock/);
      await expect(executionCount(claim.scheduleId)).resolves.toBe(0);
      await expect(
        dataSource.getRepository(PluginActionSchedule).findOneByOrFail({ id: claim.scheduleId })
      ).resolves.toMatchObject({ lastExecutionId: null });
    });
  });
});
