import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource, Table } from 'typeorm';
import {
  addTransactionalDataSource,
  initializeTransactionalContext,
  StorageDriver,
} from 'typeorm-transactional';
import { CreatePluginActionExecution1790900000001 } from 'src/migrations/1790900000001-create-plugin-action-execution';
import { PluginActionExecution } from 'src/plugin-host/entities/plugin-action-execution.entity';
import { PluginInstallation } from 'src/plugin-host/entities/plugin-installation.entity';
import { PluginActionExecutionStatus } from 'src/plugin-host/enums/plugin-action-execution-status.enum';
import { TooManyExecutionsError } from 'src/plugin-host/errors/plugin-action.errors';
import {
  InsertRunningExecutionInput,
  PluginActionExecutionService,
} from 'src/plugin-host/services/plugin-action-execution.service';
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

const TABLES = ['plugin_action_execution', 'plugin_installation', 'migrations'];
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
      entities: [PluginActionExecution, PluginInstallation],
      migrations: [CreatePluginActionExecution1790900000001],
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
      dataSource.getRepository(PluginInstallation)
    );
  }, 60_000);

  afterEach(async () => {
    await dataSource.query('DELETE FROM plugin_action_execution');
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
    const applied: { name: string }[] = await dataSource.query('SELECT name FROM migrations');
    expect(applied.map(row => row.name)).toEqual(['CreatePluginActionExecution1790900000001']);
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
});
