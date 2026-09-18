import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

const TRIGGERS = 'search_reindex_triggers';
const REPORT_INDEXES = [
  new TableIndex({
    name: 'idx_report_search_by_mart',
    columnNames: ['dataMartId', 'createdAt', 'id'],
  }),
  new TableIndex({
    name: 'idx_report_search_by_destination',
    columnNames: ['dataDestinationId', 'createdAt', 'id'],
  }),
];

export class AddReportReindexProgress1787788800005 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn(TRIGGERS, 'reportProgress'))) {
      await runner.addColumn(
        TRIGGERS,
        new TableColumn({ name: 'reportProgress', type: 'text', isNullable: true })
      );
    }
    for (const index of REPORT_INDEXES) {
      if (
        !(await runner.getTable('report'))?.indices.some(existing => existing.name === index.name)
      ) {
        await runner.createIndex('report', index);
      }
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    for (const index of REPORT_INDEXES) {
      if (
        (await runner.getTable('report'))?.indices.some(existing => existing.name === index.name)
      ) {
        await runner.dropIndex('report', index);
      }
    }
    if (await runner.hasColumn(TRIGGERS, 'reportProgress')) {
      await runner.dropColumn(TRIGGERS, 'reportProgress');
    }
  }
}
