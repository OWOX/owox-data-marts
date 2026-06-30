import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

const SEARCH_INDEX_TABLES = [
  { name: 'data_mart_search_index', hasDraftAndFieldCount: true },
  { name: 'data_storage_search_index', hasDraftAndFieldCount: false },
  { name: 'data_destination_search_index', hasDraftAndFieldCount: false },
];

function searchIndexColumns(hasDraftAndFieldCount: boolean): TableColumn[] {
  const columns = [
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
  ];

  if (hasDraftAndFieldCount) {
    columns.splice(2, 0, new TableColumn({ name: 'is_draft', type: 'boolean', default: false }));
    columns.splice(
      columns.findIndex(column => column.name === 'doc_hash'),
      0,
      new TableColumn({ name: 'field_count', type: 'int', isNullable: true })
    );
  }

  return columns;
}

function searchIndexIndices(table: string): TableIndex[] {
  return [
    new TableIndex({ name: `idx_${table}_project`, columnNames: ['project_id'] }),
    new TableIndex({
      name: `idx_${table}_project_entity`,
      columnNames: ['project_id', 'entity_id'],
    }),
  ];
}

export class CreateSearchIndexTables1782131671353 implements MigrationInterface {
  public readonly name = 'CreateSearchIndexTables1782131671353';

  private readonly REINDEX_TRIGGER_TABLE = 'search_reindex_triggers';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of SEARCH_INDEX_TABLES) {
      if (!(await queryRunner.hasTable(table.name))) {
        await queryRunner.createTable(
          new Table({
            name: table.name,
            columns: searchIndexColumns(table.hasDraftAndFieldCount),
            indices: searchIndexIndices(table.name),
          })
        );
      }
    }

    if (queryRunner.connection.options.type === 'mysql') {
      for (const table of SEARCH_INDEX_TABLES) {
        await this.ensureMysqlFullTextIndex(queryRunner, table.name);
      }
    }

    if (!(await queryRunner.hasTable(this.REINDEX_TRIGGER_TABLE))) {
      await queryRunner.createTable(
        new Table({
          name: this.REINDEX_TRIGGER_TABLE,
          columns: [
            new TableColumn({ name: 'id', type: 'varchar', length: '36', isPrimary: true }),
            new TableColumn({ name: 'isActive', type: 'boolean' }),
            new TableColumn({ name: 'version', type: 'int' }),
            new TableColumn({ name: 'status', type: 'varchar', length: '16', default: "'IDLE'" }),
            new TableColumn({ name: 'projectId', type: 'varchar', length: '255' }),
            new TableColumn({ name: 'entityType', type: 'varchar', length: '64' }),
            new TableColumn({ name: 'entityId', type: 'varchar', length: '36' }),
            new TableColumn({ name: 'operation', type: 'varchar', length: '16' }),
            new TableColumn({
              name: 'createdAt',
              type: 'datetime',
              default: 'CURRENT_TIMESTAMP',
            }),
            new TableColumn({
              name: 'modifiedAt',
              type: 'datetime',
              default: 'CURRENT_TIMESTAMP',
            }),
          ],
          indices: [
            new TableIndex({
              name: 'idx_search_reindex_trigger_ready',
              columnNames: ['isActive', 'status'],
            }),
            new TableIndex({
              name: 'idx_search_reindex_trigger_entity',
              columnNames: ['entityType', 'entityId', 'status'],
            }),
          ],
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, this.REINDEX_TRIGGER_TABLE);
    for (const table of SEARCH_INDEX_TABLES) {
      await softDropTable(queryRunner, table.name);
    }
  }

  private async ensureMysqlFullTextIndex(queryRunner: QueryRunner, table: string): Promise<void> {
    const indexName = `ftx_${table}_search_text`;
    const rows: { INDEX_NAME: string }[] = await queryRunner.query(
      `SELECT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND INDEX_NAME = ?
         AND INDEX_TYPE = 'FULLTEXT'`,
      [table, indexName]
    );
    if (rows.length === 0) {
      await queryRunner.query(`ALTER TABLE ${table} ADD FULLTEXT INDEX ${indexName} (search_text)`);
    }
  }
}
