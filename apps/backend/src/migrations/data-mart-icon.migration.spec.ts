import { DataSource, Table } from 'typeorm';
import { AddIconToDataMart1790247861000 } from './1790247861000-add-icon-to-data-mart';

describe('Data Mart icon migration', () => {
  it('adds a nullable icon without changing existing Data Marts and supports rollback', async () => {
    const dataSource = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      synchronize: false,
    }).initialize();
    const runner = dataSource.createQueryRunner();
    try {
      await runner.createTable(
        new Table({
          name: 'data_mart',
          columns: [
            { name: 'id', type: 'varchar', isPrimary: true },
            { name: 'title', type: 'varchar' },
          ],
        })
      );
      await runner.query("INSERT INTO data_mart (id, title) VALUES ('existing', 'Orders')");
      const migration = new AddIconToDataMart1790247861000();

      await migration.up(runner);
      await migration.up(runner);
      expect(await runner.query('SELECT * FROM data_mart')).toEqual([
        { id: 'existing', title: 'Orders', icon: null },
      ]);

      await migration.down(runner);
      expect(await runner.hasColumn('data_mart', 'icon')).toBe(false);
      expect(await runner.query('SELECT * FROM data_mart')).toEqual([
        { id: 'existing', title: 'Orders' },
      ]);
    } finally {
      await runner.release();
      await dataSource.destroy();
    }
  });
});
