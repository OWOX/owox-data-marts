import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PluginActionExecution } from '../plugin-host/entities/plugin-action-execution.entity';
import { CreatePluginActionExecution1790900000001 } from './1790900000001-create-plugin-action-execution';
import { AddPluginActionExecutionPayloadsClearedAt1790900000002 } from './1790900000002-add-plugin-action-execution-payloads-cleared-at';
import { StorePluginActionPayloadsAsText1790900000003 } from './1790900000003-store-plugin-action-payloads-as-text';

const TABLE = 'plugin_action_execution';

describe('StorePluginActionPayloadsAsText1790900000003 on SQLite', () => {
  it('changes nothing, and rows the json column wrote read back unchanged', async () => {
    const db = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [PluginActionExecution],
    }).initialize();
    const runner = db.createQueryRunner();
    try {
      await new CreatePluginActionExecution1790900000001().up(runner);
      await new AddPluginActionExecutionPayloadsClearedAt1790900000002().up(runner);
      const payloads: [string, unknown, unknown][] = [
        ['e1', '12345', { zeta: 1, alpha: { b: 2, a: 1 } }],
        ['e2', 12345, 'true'],
        ['e3', { documentId: 'd1' }, null],
      ];
      // What TypeORM's SQLite driver wrote for a `json` column: JSON.stringify text, or NULL.
      for (const [id, input, result] of payloads) {
        await runner.query(
          `INSERT INTO ${TABLE}
            (id, pluginId, pluginVersionId, installationId, projectId, userId, action, trigger, status, role, input, result)
            VALUES (?, 'p', 'v', 'i', 'project', 'user', 'run', 'frontend', 'SUCCEEDED', 'editor', ?, ?)`,
          [id, JSON.stringify(input), result === null ? null : JSON.stringify(result)]
        );
      }
      const before = await runner.getTable(TABLE);

      await new StorePluginActionPayloadsAsText1790900000003().up(runner);

      const after = await runner.getTable(TABLE);
      expect(after?.findColumnByName('input')?.type).toBe(before?.findColumnByName('input')?.type);
      expect(after?.findColumnByName('result')?.type).toBe(
        before?.findColumnByName('result')?.type
      );
      const rows = await db.getRepository(PluginActionExecution).find({ order: { id: 'ASC' } });
      expect(rows.map(row => [row.id, row.input, row.result])).toEqual(payloads);
      expect(JSON.stringify(rows[0].result)).toBe('{"zeta":1,"alpha":{"b":2,"a":1}}');
    } finally {
      await runner.release();
      await db.destroy();
    }
  });
});
