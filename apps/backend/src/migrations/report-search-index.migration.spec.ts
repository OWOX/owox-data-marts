import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CreateReportSearchIndexTables1787788800004 } from './1787788800004-create-report-search-index-tables';

describe('CreateReportSearchIndexTables1787788800004', () => {
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

  it('creates the report index and project reindex trigger tables idempotently and reversibly', async () => {
    const runner = dataSource.createQueryRunner();
    const migration = new CreateReportSearchIndexTables1787788800004();

    await migration.up(runner);
    await migration.up(runner);

    const indexTable = await runner.getTable('report_search_index');
    expect(indexTable?.columns.map(column => column.name).sort()).toEqual(
      [
        'doc_hash',
        'document',
        'embedding',
        'embedding_status',
        'entity_id',
        'project_id',
        'search_text',
        'updated_at',
      ].sort()
    );
    expect(indexTable?.indices.map(index => index.name).sort()).toEqual([
      'idx_report_search_index_project',
      'idx_report_search_index_project_entity',
    ]);

    const triggerTable = await runner.getTable('search_report_project_reindex_triggers');
    expect(triggerTable?.columns.map(column => column.name)).toEqual(
      expect.arrayContaining(['id', 'isActive', 'version', 'status', 'projectId'])
    );
    expect(triggerTable?.indices.map(index => index.name).sort()).toEqual([
      'idx_search_report_project_reindex_trigger_project',
      'idx_search_report_project_reindex_trigger_ready',
    ]);

    await migration.down(runner);

    expect(await runner.hasTable('report_search_index')).toBe(false);
    expect(await runner.hasTable('search_report_project_reindex_triggers')).toBe(false);
    await runner.release();
  });
});
