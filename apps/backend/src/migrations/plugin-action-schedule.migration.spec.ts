import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CreatePluginActionExecution1790900000001 } from './1790900000001-create-plugin-action-execution';
import { CreatePluginActionSchedule1791100000000 } from './1791100000000-create-plugin-action-schedule';

const EXECUTION_INDEXES = [
  'UQ_plugin_action_execution_token',
  'idx_plugin_action_execution_deadline',
  'idx_plugin_action_execution_finished',
  'idx_plugin_action_execution_payloads',
  'idx_plugin_action_execution_running',
  'idx_plugin_action_execution_starts',
];

describe('CreatePluginActionSchedule1791100000000', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    }).initialize();
    const runner = dataSource.createQueryRunner();
    try {
      await new CreatePluginActionExecution1790900000001().up(runner);
      await runner.query(
        `INSERT INTO plugin_action_execution
          (id, pluginId, pluginVersionId, installationId, projectId, userId, action, "trigger", status, role)
          VALUES ('e1', 'p', 'v', 'i', 'project', 'u', 'run', 'frontend', 'SUCCEEDED', 'editor')`
      );
    } finally {
      await runner.release();
    }
  });

  afterEach(async () => dataSource.destroy());

  it('creates the schedule table and the execution columns and indexes, idempotently', async () => {
    const runner = dataSource.createQueryRunner();
    try {
      const migration = new CreatePluginActionSchedule1791100000000();

      await migration.up(runner);
      await migration.up(runner);

      const schedule = await runner.getTable('plugin_action_schedule');
      expect(schedule?.columns.map(column => column.name).sort()).toEqual(
        [
          'action',
          'createdAt',
          'cronExpression',
          'disabledReason',
          'id',
          'installationId',
          'isActive',
          'lastExecutionId',
          'lastRunTimestamp',
          'modifiedAt',
          'name',
          'nextRunTimestamp',
          'parameters',
          'pluginId',
          'projectId',
          'status',
          'timeZone',
          'version',
        ].sort()
      );
      expect(
        schedule?.indices
          .map(index => [index.name, index.columnNames])
          .sort(([a], [b]) => String(a).localeCompare(String(b)))
      ).toEqual([
        ['idx_plugin_action_schedule_installation', ['installationId']],
        ['idx_plugin_action_schedule_ready', ['isActive', 'status', 'nextRunTimestamp']],
      ]);
      expect(schedule?.findColumnByName('parameters')?.type).toBe('text');
      expect(schedule?.findColumnByName('parameters')?.isNullable).toBe(true);
      expect(String(schedule?.findColumnByName('status')?.default)).toContain('IDLE');
      expect(schedule?.foreignKeys).toEqual([]);

      const execution = await runner.getTable('plugin_action_execution');
      expect(execution?.findColumnByName('scheduleId')?.isNullable).toBe(true);
      expect(execution?.findColumnByName('queuedAt')?.isNullable).toBe(true);
      expect(execution?.indices.map(index => index.name).sort()).toEqual(
        [
          ...EXECUTION_INDEXES,
          'idx_plugin_action_execution_queue',
          'idx_plugin_action_execution_schedule',
        ].sort()
      );
      expect(
        execution?.indices.find(index => index.name === 'idx_plugin_action_execution_queue')
          ?.columnNames
      ).toEqual(['installationId', 'status', 'queuedAt']);
      expect(
        execution?.indices.find(index => index.name === 'idx_plugin_action_execution_schedule')
          ?.columnNames
      ).toEqual(['scheduleId', 'status']);
      expect(
        execution?.indices.find(index => index.name === 'UQ_plugin_action_execution_token')
          ?.isUnique
      ).toBe(true);
      expect(
        await runner.query('SELECT id, scheduleId, queuedAt FROM plugin_action_execution')
      ).toEqual([{ id: 'e1', scheduleId: null, queuedAt: null }]);
    } finally {
      await runner.release();
    }
  });

  it('cancels queued executions, drops the execution columns and keeps the schedules in a backup table on the way down', async () => {
    const runner = dataSource.createQueryRunner();
    try {
      const migration = new CreatePluginActionSchedule1791100000000();
      await migration.up(runner);
      await runner.query(
        `INSERT INTO plugin_action_schedule
          (id, pluginId, installationId, projectId, action, cronExpression, timeZone, isActive, version)
          VALUES ('s1', 'p', 'i', 'project', 'run', '0 9 * * *', 'UTC', 1, 1)`
      );
      await runner.query(
        `INSERT INTO plugin_action_execution
          (id, pluginId, pluginVersionId, installationId, projectId, userId, action, "trigger", status, role, scheduleId, queuedAt)
          VALUES ('e2', 'p', 'v', 'i', 'project', 'u', 'run', 'schedule', 'QUEUED', 'editor', 's1', CURRENT_TIMESTAMP)`
      );

      await migration.down(runner);
      await migration.down(runner);

      expect(
        await runner.query(
          'SELECT id, status, finishedAt IS NOT NULL AS finished, errorMessage FROM plugin_action_execution ORDER BY id'
        )
      ).toEqual([
        { id: 'e1', status: 'SUCCEEDED', finished: 0, errorMessage: null },
        { id: 'e2', status: 'CANCELLED', finished: 1, errorMessage: null },
      ]);

      expect(await runner.hasTable('plugin_action_schedule')).toBe(false);
      expect(await runner.query('SELECT id FROM plugin_action_schedule_backup')).toEqual([
        { id: 's1' },
      ]);
      expect(await runner.hasColumn('plugin_action_execution', 'scheduleId')).toBe(false);
      expect(await runner.hasColumn('plugin_action_execution', 'queuedAt')).toBe(false);
      expect(
        (await runner.getTable('plugin_action_execution'))?.indices.map(index => index.name).sort()
      ).toEqual([...EXECUTION_INDEXES].sort());
    } finally {
      await runner.release();
    }
  });

  it('can go down and up again on SQLite, where the backup table would keep the index names', async () => {
    const runner = dataSource.createQueryRunner();
    try {
      const migration = new CreatePluginActionSchedule1791100000000();

      await migration.up(runner);
      await migration.down(runner);
      await migration.up(runner);

      expect(
        (await runner.getTable('plugin_action_schedule'))?.indices.map(index => index.name).sort()
      ).toEqual(['idx_plugin_action_schedule_installation', 'idx_plugin_action_schedule_ready']);
    } finally {
      await runner.release();
    }
  });
});
