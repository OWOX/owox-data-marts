import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';
import { getTable } from './migration-utils';

/**
 * Creates a composite index on data_mart_run for efficient filtering by status.
 * Implemented via TypeORM DSL to support both MySQL and SQLite.
 */
export class CreateIndexDataMartRunStatus1760448668537 implements MigrationInterface {
  private readonly TABLE_NAME = 'data_mart_run';
  public readonly name = 'CreateIndexDataMartRunStatus1760448668537';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.createIndex(
      table,
      new TableIndex({
        name: 'idx_dmr_status',
        columnNames: ['status'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.dropIndex(table, 'idx_dmr_status');
  }
}
