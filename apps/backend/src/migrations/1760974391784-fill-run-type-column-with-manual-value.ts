import { MigrationInterface, QueryRunner } from 'typeorm';

export class FillRunTypeColumnWithManualValue1760974391784 implements MigrationInterface {
  private readonly TABLE_NAME = 'data_mart_run';
  public readonly name = 'FillRunTypeColumnWithManualValue1760974391784';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE ${this.TABLE_NAME} SET runType = 'manual'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE ${this.TABLE_NAME} SET runType = NULL`);
  }
}
