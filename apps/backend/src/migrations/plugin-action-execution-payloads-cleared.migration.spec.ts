import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CreatePluginActionExecution1790900000001 } from './1790900000001-create-plugin-action-execution';
import { AddPluginActionExecutionPayloadsClearedAt1790900000002 } from './1790900000002-add-plugin-action-execution-payloads-cleared-at';

const TABLE = 'plugin_action_execution';
const INDEX = 'idx_plugin_action_execution_payloads';

describe('AddPluginActionExecutionPayloadsClearedAt1790900000002', () => {
  it('adds the column and its index idempotently, keeps the rows, and removes both on the way down', async () => {
    const db = await new DataSource({ type: 'better-sqlite3', database: ':memory:' }).initialize();
    const runner = db.createQueryRunner();
    try {
      await new CreatePluginActionExecution1790900000001().up(runner);
      await runner.query(`INSERT INTO plugin_action_execution
        (id, pluginId, pluginVersionId, installationId, projectId, userId, action, trigger, status, role)
        VALUES ('e1', 'p', 'v', 'i', 'project', 'user', 'run', 'frontend', 'SUCCEEDED', 'editor')`);
      const migration = new AddPluginActionExecutionPayloadsClearedAt1790900000002();

      await migration.up(runner);
      await migration.up(runner);

      const table = await runner.getTable(TABLE);
      expect(table?.findColumnByName('payloadsClearedAt')?.isNullable).toBe(true);
      expect(table?.indices.find(index => index.name === INDEX)?.columnNames).toEqual([
        'payloadsClearedAt',
        'finishedAt',
      ]);
      expect(table?.indices).toHaveLength(6);
      expect(await runner.query(`SELECT id, payloadsClearedAt FROM ${TABLE}`)).toEqual([
        { id: 'e1', payloadsClearedAt: null },
      ]);

      await migration.down(runner);
      await migration.down(runner);

      expect(await runner.hasColumn(TABLE, 'payloadsClearedAt')).toBe(false);
      expect((await runner.getTable(TABLE))?.indices.map(index => index.name)).not.toContain(INDEX);
      expect(await runner.query(`SELECT id FROM ${TABLE}`)).toEqual([{ id: 'e1' }]);
    } finally {
      await runner.release();
      await db.destroy();
    }
  });
});
