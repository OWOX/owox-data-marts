import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddTypeColumnToDataMartRun1760974391785 implements MigrationInterface {
  public readonly name = 'AddTypeColumnToDataMartRun1760974391785';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add Type Column
    await queryRunner.query(`ALTER TABLE data_mart_run ADD COLUMN type VARCHAR(255) DEFAULT NULL`);

    // Fill column values by 'CONNECTOR' type
    await queryRunner.query(`UPDATE data_mart_run SET type='CONNECTOR'`);

    // Add Index for Type Column
    await queryRunner.createIndex(
      'data_mart_run',
      new TableIndex({
        name: 'idx_dmr_type',
        columnNames: ['type'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('data_mart_run', 'idx_dmr_type');
    await queryRunner.query(`ALTER TABLE data_mart_run DROP COLUMN type`);
  }
}
