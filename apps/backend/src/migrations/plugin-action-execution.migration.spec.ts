import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CreatePluginActionExecution1790900000001 } from './1790900000001-create-plugin-action-execution';

describe('CreatePluginActionExecution migration', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    });
    await dataSource.initialize();
  });

  afterEach(async () => dataSource.destroy());

  it('creates the table with its indexes and is idempotent', async () => {
    const runner = dataSource.createQueryRunner();
    const migration = new CreatePluginActionExecution1790900000001();

    await migration.up(runner);
    await migration.up(runner);

    const table = await runner.getTable('plugin_action_execution');
    expect(table?.columns.map(column => column.name).sort()).toEqual(
      [
        'action',
        'createdAt',
        'deadlineAt',
        'errorCode',
        'errorMessage',
        'finishedAt',
        'id',
        'input',
        'installationId',
        'pluginId',
        'pluginVersionId',
        'projectId',
        'payloadBytes',
        'payloadsClearedAt',
        'result',
        'role',
        'startedAt',
        'status',
        'tokenHash',
        'trigger',
        'userId',
      ].sort()
    );
    expect(table?.indices.map(index => index.name).sort()).toEqual(
      [
        'UQ_plugin_action_execution_token',
        'idx_plugin_action_execution_deadline',
        'idx_plugin_action_execution_finished',
        'idx_plugin_action_execution_running',
        'idx_plugin_action_execution_payloads',
        'idx_plugin_action_execution_starts',
      ].sort()
    );
    expect(
      table?.indices.find(index => index.name === 'UQ_plugin_action_execution_token')?.isUnique
    ).toBe(true);
    expect(
      table?.indices.find(index => index.name === 'idx_plugin_action_execution_starts')?.columnNames
    ).toEqual(['installationId', 'startedAt', 'payloadBytes']);
    expect(table?.findColumnByName('payloadsClearedAt')?.isNullable).toBe(true);
    const bytes = table?.findColumnByName('payloadBytes');
    expect(bytes?.isNullable).toBe(false);
    expect(String(bytes?.default)).toBe('0');
    expect(table?.findColumnByName('input')?.type).toBe('text');
    expect(table?.findColumnByName('result')?.type).toBe('text');
    expect(table?.foreignKeys).toEqual([]);
    await runner.release();
  });

  it('keeps the rows in a backup table on the way down', async () => {
    const runner = dataSource.createQueryRunner();
    const migration = new CreatePluginActionExecution1790900000001();
    await migration.up(runner);

    await migration.down(runner);

    expect(await runner.hasTable('plugin_action_execution')).toBe(false);
    expect(await runner.hasTable('plugin_action_execution_backup')).toBe(true);
    await runner.release();
  });
});
