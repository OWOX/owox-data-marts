import { DataSource, Table } from 'typeorm';
import { AddSoftDeleteToReport1789646400000 } from './1789646400000-add-soft-delete-to-report';

describe('Report soft-delete migration', () => {
  it('adds a nullable deletion timestamp without changing existing reports and supports rollback', async () => {
    const dataSource = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      synchronize: false,
    }).initialize();
    const runner = dataSource.createQueryRunner();
    try {
      await runner.createTable(
        new Table({
          name: 'report',
          columns: [
            { name: 'id', type: 'varchar', isPrimary: true },
            { name: 'title', type: 'varchar' },
          ],
        })
      );
      await runner.query("INSERT INTO report (id, title) VALUES ('existing', 'Keep this report')");
      const migration = new AddSoftDeleteToReport1789646400000();

      await migration.up(runner);
      expect(await runner.query('SELECT * FROM report')).toEqual([
        { id: 'existing', title: 'Keep this report', deletedAt: null },
      ]);

      await migration.down(runner);
      expect(await runner.hasColumn('report', 'deletedAt')).toBe(false);
      expect(await runner.query('SELECT * FROM report')).toEqual([
        { id: 'existing', title: 'Keep this report' },
      ]);
    } finally {
      await runner.release();
      await dataSource.destroy();
    }
  });
});
