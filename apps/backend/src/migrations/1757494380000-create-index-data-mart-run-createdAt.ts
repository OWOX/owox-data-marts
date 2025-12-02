import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';
import { getTable } from './migration-utils';

/**
 * Creates a composite index on data_mart_run for efficient filtering/sorting by dataMartId and createdAt.
 * Implemented via TypeORM DSL to support both MySQL and SQLite.
 */
export class CreateIndexDataMartRunCreatedAt1758203874000 implements MigrationInterface {
  private readonly TABLE_NAME = 'data_mart_run';
  public readonly name = 'CreateIndexDataMartRunCreatedAt1758203874000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.createIndex(
      table,
      new TableIndex({
        name: 'idx_dmr_dataMart_createdAt',
        columnNames: ['dataMartId', 'createdAt'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.dropIndex(table, 'idx_dmr_dataMart_createdAt');
  }
}
