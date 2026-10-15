import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AddPluginVersionBackend1790900000000 } from './1790900000000-add-plugin-version-backend';

const TABLE = 'plugin_version';

describe('AddPluginVersionBackend1790900000000', () => {
  it('adds the nullable column idempotently, keeps the rows, and removes it on the way down', async () => {
    const db = await new DataSource({ type: 'better-sqlite3', database: ':memory:' }).initialize();
    const runner = db.createQueryRunner();
    try {
      await runner.query(`CREATE TABLE ${TABLE} (id varchar PRIMARY KEY NOT NULL)`);
      await runner.query(`INSERT INTO ${TABLE} (id) VALUES ('v1')`);
      const migration = new AddPluginVersionBackend1790900000000();

      await migration.up(runner);
      await migration.up(runner);

      const column = (await runner.getTable(TABLE))?.findColumnByName('backend');
      expect(column?.isNullable).toBe(true);
      expect(await runner.query(`SELECT id, backend FROM ${TABLE}`)).toEqual([
        { id: 'v1', backend: null },
      ]);

      await migration.down(runner);
      await migration.down(runner);

      expect(await runner.hasColumn(TABLE, 'backend')).toBe(false);
      expect(await runner.query(`SELECT id FROM ${TABLE}`)).toEqual([{ id: 'v1' }]);
    } finally {
      await runner.release();
      await db.destroy();
    }
  });
});
