import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';
import { getTable } from './migration-utils';

/**
 * Creates a composite index on data_mart (projectId, deletedAt, createdAt, id)
 * to allow MySQL to use the index for filtering by projectId + deletedAt IS NULL
 * and sorting by createdAt DESC, id ASC — eliminating the need for a sort buffer.
 */
export class AddDataMartCompositeIndex1771023180001 implements MigrationInterface {
  public readonly name = 'AddDataMartCompositeIndex1771023180001';

  private readonly tableName = 'data_mart';
  private readonly indexName = 'idx_dm_project_deleted_created';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.tableName);
    await queryRunner.createIndex(
      table,
      new TableIndex({
        name: this.indexName,
        columnNames: ['projectId', 'deletedAt', 'createdAt', 'id'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.tableName);
    await queryRunner.dropIndex(table, this.indexName);
  }
}
