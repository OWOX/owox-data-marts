import 'reflect-metadata';
import { DataSource, Table } from 'typeorm';
import { CreateSearchIndexTables1782131671353 } from './1782131671353-create-search-index-tables';
import { AddReportReindexProgress1787788800005 } from './1787788800005-add-report-reindex-progress';

describe('AddReportReindexProgress1787788800005', () => {
  it('preserves existing triggers and adds bounded parent pagination indexes idempotently', async () => {
    const db = await new DataSource({ type: 'better-sqlite3', database: ':memory:' }).initialize();
    const runner = db.createQueryRunner();
    try {
      await new CreateSearchIndexTables1782131671353().up(runner);
      await runner.createTable(
        new Table({
          name: 'report',
          columns: [
            { name: 'id', type: 'varchar', isPrimary: true },
            { name: 'dataMartId', type: 'varchar' },
            { name: 'dataDestinationId', type: 'varchar' },
            { name: 'createdAt', type: 'datetime' },
          ],
        })
      );
      await runner.query(`INSERT INTO search_reindex_triggers
        (id, isActive, version, status, projectId, entityType, entityId, operation)
        VALUES ('existing', 1, 1, 'IDLE', 'p', 'DATA_MART', 'dm', 'REINDEX')`);
      const migration = new AddReportReindexProgress1787788800005();
      await migration.up(runner);
      await migration.up(runner);
      expect(
        (await runner.getTable('search_reindex_triggers'))?.findColumnByName('reportProgress')
          ?.isNullable
      ).toBe(true);
      expect((await runner.getTable('report'))?.indices.map(index => index.columnNames)).toEqual(
        expect.arrayContaining([
          ['dataMartId', 'createdAt', 'id'],
          ['dataDestinationId', 'createdAt', 'id'],
        ])
      );
      expect(
        await runner.query('SELECT operation, reportProgress FROM search_reindex_triggers')
      ).toEqual([{ operation: 'REINDEX', reportProgress: null }]);
      await migration.down(runner);
      expect(await runner.hasColumn('search_reindex_triggers', 'reportProgress')).toBe(false);
      expect((await runner.getTable('report'))?.indices).toHaveLength(0);
      expect(await runner.query('SELECT operation FROM search_reindex_triggers')).toEqual([
        { operation: 'REINDEX' },
      ]);
    } finally {
      await runner.release();
      await db.destroy();
    }
  });
});
