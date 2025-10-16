import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateDataMartRunTableCreatedByIdAndRunType1760604480000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add nullable createdById column (string). Works for MySQL and SQLite.
    await queryRunner.query(
      `ALTER TABLE data_mart_run ADD COLUMN createdById VARCHAR(255) DEFAULT NULL`
    );

    // Add nullable runType column (stores RunType enum as string). Works for MySQL and SQLite.
    await queryRunner.query(
      `ALTER TABLE data_mart_run ADD COLUMN runType VARCHAR(255) DEFAULT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert changes by dropping columns in reverse order
    await queryRunner.query(`ALTER TABLE data_mart_run DROP COLUMN runType`);
    await queryRunner.query(`ALTER TABLE data_mart_run DROP COLUMN createdById`);
  }
}
