import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';
import { getTable } from './migration-utils';

export class AddTypeColumnToDataMartRun1760974391785 implements MigrationInterface {
  private readonly TABLE_NAME = 'data_mart_run';
  public readonly name = 'AddTypeColumnToDataMartRun1760974391785';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    // Add Type Column
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'type',
        type: 'varchar',
        isNullable: true,
        default: null,
      })
    );

    // Fill column values by 'CONNECTOR' type
    await queryRunner.query(`UPDATE ${this.TABLE_NAME} SET type='CONNECTOR'`);

    // Add Index for Type Column
    await queryRunner.createIndex(
      table,
      new TableIndex({
        name: 'idx_dmr_type',
        columnNames: ['type'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.dropIndex(table, 'idx_dmr_type');
    await queryRunner.dropColumn(table, 'type');
  }
}
