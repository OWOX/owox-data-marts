import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

/**
 * Creates a composite index on data_mart_run for efficient filtering/sorting by dataMartId and createdAt.
 * Implemented via TypeORM DSL to support both MySQL and SQLite.
 */
export class CreateIndexDataMartRunCreatedAt1758203874000 implements MigrationInterface {
  public readonly name = 'CreateIndexDataMartRunCreatedAt1758203874000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex(
      'data_mart_run',
      new TableIndex({
        name: 'idx_dmr_dataMart_createdAt',
        columnNames: ['dataMartId', 'createdAt'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('data_mart_run', 'idx_dmr_dataMart_createdAt');
  }
}
