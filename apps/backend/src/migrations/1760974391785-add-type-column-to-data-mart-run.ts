import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddTypeColumnToDataMartRun1760974391785 implements MigrationInterface {
  private readonly TABLE_NAME = 'data_mart_run';
  public readonly name = 'AddTypeColumnToDataMartRun1760974391785';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add Type Column
    await queryRunner.addColumn(
      this.TABLE_NAME,
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
      this.TABLE_NAME,
      new TableIndex({
        name: 'idx_dmr_type',
        columnNames: ['type'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(this.TABLE_NAME, 'idx_dmr_type');
    await queryRunner.dropColumn(this.TABLE_NAME, 'type');
  }
}
