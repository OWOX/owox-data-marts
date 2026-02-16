import { MigrationInterface, QueryRunner } from 'typeorm';
import { getTable } from './migration-utils';

/**
 * Creates a composite index on data_mart (projectId, deletedAt, createdAt DESC, id ASC)
 * to allow MySQL to use the index for filtering by projectId + deletedAt IS NULL
 * and sorting by createdAt DESC, id ASC — eliminating the need for a sort buffer.
 *
 * Uses raw SQL for CREATE because TypeORM's TableIndex does not support per-column sort direction.
 * SQLite accepts DESC/ASC syntax but ignores it (all indexes are effectively ASC).
 * MySQL 8.0+ respects DESC/ASC in indexes.
 */
export class AddDataMartCompositeIndex1771023180001 implements MigrationInterface {
  public readonly name = 'AddDataMartCompositeIndex1771023180001';

  private readonly tableName = 'data_mart';
  private readonly indexName = 'idx_dm_project_deleted_created';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS \`${this.indexName}\` ON \`${this.tableName}\` (projectId, deletedAt, createdAt DESC, id ASC)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.tableName);
    await queryRunner.dropIndex(table, this.indexName);
  }
}
