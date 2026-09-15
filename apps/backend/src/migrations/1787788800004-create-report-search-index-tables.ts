import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

const INDEX_TABLE = 'report_search_index';
const TRIGGER_TABLE = 'search_report_project_reindex_triggers';

export class CreateReportSearchIndexTables1787788800004 implements MigrationInterface {
  public readonly name = 'CreateReportSearchIndexTables1787788800004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable(INDEX_TABLE))) {
      await queryRunner.createTable(
        new Table({
          name: INDEX_TABLE,
          columns: [
            new TableColumn({ name: 'entity_id', type: 'varchar', length: '36', isPrimary: true }),
            new TableColumn({ name: 'project_id', type: 'varchar', length: '255' }),
            new TableColumn({ name: 'embedding', type: 'blob', isNullable: true }),
            new TableColumn({
              name: 'embedding_status',
              type: 'varchar',
              length: '16',
              default: "'MISSING'",
            }),
            new TableColumn({ name: 'document', type: 'text', isNullable: true }),
            new TableColumn({ name: 'search_text', type: 'text', isNullable: true }),
            new TableColumn({ name: 'doc_hash', type: 'varchar', length: '64' }),
            new TableColumn({ name: 'updated_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' }),
          ],
          indices: [
            new TableIndex({ name: `idx_${INDEX_TABLE}_project`, columnNames: ['project_id'] }),
            new TableIndex({
              name: `idx_${INDEX_TABLE}_project_entity`,
              columnNames: ['project_id', 'entity_id'],
            }),
          ],
        })
      );
    }

    if (queryRunner.connection.options.type === 'mysql') {
      await this.ensureMysqlFullTextIndex(queryRunner);
    }

    if (!(await queryRunner.hasTable(TRIGGER_TABLE))) {
      await queryRunner.createTable(
        new Table({
          name: TRIGGER_TABLE,
          columns: [
            new TableColumn({ name: 'id', type: 'varchar', length: '36', isPrimary: true }),
            new TableColumn({ name: 'isActive', type: 'boolean' }),
            new TableColumn({ name: 'version', type: 'int' }),
            new TableColumn({ name: 'status', type: 'varchar', length: '16', default: "'IDLE'" }),
            new TableColumn({ name: 'projectId', type: 'varchar', length: '255' }),
            new TableColumn({ name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' }),
            new TableColumn({ name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' }),
          ],
          indices: [
            new TableIndex({
              name: 'idx_search_report_project_reindex_trigger_ready',
              columnNames: ['isActive', 'status'],
            }),
            new TableIndex({
              name: 'idx_search_report_project_reindex_trigger_project',
              columnNames: ['projectId', 'status'],
            }),
          ],
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, TRIGGER_TABLE);
    await softDropTable(queryRunner, INDEX_TABLE);
  }

  private async ensureMysqlFullTextIndex(queryRunner: QueryRunner): Promise<void> {
    const indexName = `ftx_${INDEX_TABLE}_search_text`;
    const rows: { INDEX_NAME: string }[] = await queryRunner.query(
      `SELECT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND INDEX_NAME = ?
         AND INDEX_TYPE = 'FULLTEXT'`,
      [INDEX_TABLE, indexName]
    );
    if (rows.length === 0) {
      await queryRunner.query(
        `ALTER TABLE ${INDEX_TABLE} ADD FULLTEXT INDEX ${indexName} (search_text)`
      );
    }
  }
}
