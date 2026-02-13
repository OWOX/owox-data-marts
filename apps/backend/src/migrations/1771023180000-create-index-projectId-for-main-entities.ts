import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';
import { getTable } from './migration-utils';

/**
 * Creates indexes on projectId for data_storage, data_mart, and data_destination tables
 * to speed up queries that filter by project.
 * Implemented via TypeORM DSL to support both MySQL and SQLite.
 */
export class CreateIndexProjectIdForMainEntities1771023180000 implements MigrationInterface {
  public readonly name = 'CreateIndexProjectIdForMainEntities1771023180000';

  private readonly indexes = [
    { table: 'data_storage', indexName: 'idx_ds_projectId' },
    { table: 'data_mart', indexName: 'idx_dm_projectId' },
    { table: 'data_destination', indexName: 'idx_dd_projectId' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, indexName } of this.indexes) {
      const tableObj = await getTable(queryRunner, table);
      await queryRunner.createIndex(
        tableObj,
        new TableIndex({
          name: indexName,
          columnNames: ['projectId'],
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, indexName } of this.indexes) {
      const tableObj = await getTable(queryRunner, table);
      await queryRunner.dropIndex(tableObj, indexName);
    }
  }
}
