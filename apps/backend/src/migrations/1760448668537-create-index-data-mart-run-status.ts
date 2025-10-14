import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

/**
 * Creates a composite index on data_mart_run for efficient filtering by status.
 * Implemented via TypeORM DSL to support both MySQL and SQLite.
 */
export class CreateIndexDataMartRunStatus1760448668537 implements MigrationInterface {
  public readonly name = 'CreateIndexDataMartRunStatus1760448668537';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex(
      'data_mart_run',
      new TableIndex({
        name: 'idx_dmr_status',
        columnNames: ['status'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('data_mart_run', 'idx_dmr_status');
  }
}
