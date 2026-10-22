import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CreatePluginActionExecution1790900000001 } from './1790900000001-create-plugin-action-execution';
import { CreatePluginActionSchedule1791100000000 } from './1791100000000-create-plugin-action-schedule';
import { AddPluginActionExecutionListIndexes1791200000000 } from './1791200000000-add-plugin-action-execution-list-indexes';

describe('AddPluginActionExecutionListIndexes1791200000000', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    }).initialize();
    const runner = dataSource.createQueryRunner();
    try {
      await new CreatePluginActionExecution1790900000001().up(runner);
      await new CreatePluginActionSchedule1791100000000().up(runner);
    } finally {
      await runner.release();
    }
  });

  afterEach(async () => dataSource.destroy());

  it('adds the list indexes idempotently, and drops only them on the way down', async () => {
    const runner = dataSource.createQueryRunner();
    try {
      const migration = new AddPluginActionExecutionListIndexes1791200000000();
      const indexes = async () =>
        ((await runner.getTable('plugin_action_execution'))?.indices ?? [])
          .map(index => [String(index.name), index.columnNames] as const)
          .sort(([a], [b]) => a.localeCompare(b));
      const before = await indexes();

      await migration.up(runner);
      await migration.up(runner);

      expect((await indexes()).filter(([name]) => name.endsWith('_created'))).toEqual([
        ['idx_plugin_action_execution_project_created', ['projectId', 'createdAt']],
        ['idx_plugin_action_execution_project_user_created', ['projectId', 'userId', 'createdAt']],
        ['idx_plugin_action_execution_schedule_created', ['scheduleId', 'createdAt']],
      ]);

      await migration.down(runner);
      await migration.down(runner);

      await expect(indexes()).resolves.toEqual(before);
    } finally {
      await runner.release();
    }
  });
});
