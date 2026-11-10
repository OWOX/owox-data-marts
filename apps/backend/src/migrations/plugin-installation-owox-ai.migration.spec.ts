import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AddPluginInstallationOwoxAi1793836800000 } from './1793836800000-add-plugin-installation-owox-ai';

const TABLE = 'plugin_installation';

describe('AddPluginInstallationOwoxAi1793836800000', () => {
  it('adds owoxAi with false for existing rows, idempotently, and removes it on the way down', async () => {
    const db = await new DataSource({ type: 'better-sqlite3', database: ':memory:' }).initialize();
    const runner = db.createQueryRunner();
    try {
      await runner.query(`CREATE TABLE ${TABLE} (id varchar PRIMARY KEY NOT NULL)`);
      await runner.query(`INSERT INTO ${TABLE} (id) VALUES ('i1')`);
      const migration = new AddPluginInstallationOwoxAi1793836800000();

      await migration.up(runner);
      await migration.up(runner);

      const column = (await runner.getTable(TABLE))?.findColumnByName('owoxAi');
      expect(column?.isNullable).toBe(false);
      expect(await runner.query(`SELECT id, owoxAi FROM ${TABLE}`)).toEqual([
        { id: 'i1', owoxAi: 0 },
      ]);

      await migration.down(runner);
      await migration.down(runner);

      expect(await runner.hasColumn(TABLE, 'owoxAi')).toBe(false);
      expect(await runner.query(`SELECT id FROM ${TABLE}`)).toEqual([{ id: 'i1' }]);
    } finally {
      await runner.release();
      await db.destroy();
    }
  });
});
