import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateDataMartRunTableAdditionalParams1754480433880 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE data_mart_run ADD COLUMN additionalParams JSON DEFAULT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE data_mart_run DROP COLUMN additionalParams`);
  }
}
