import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorNullableFieldsInDataMartRun1762812222908 implements MigrationInterface {
  public readonly name = 'RefactorNullableFieldsInDataMartRun1762812222908';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE data_mart_run SET runType = 'manual' WHERE runType IS NULL`);

    await queryRunner.query(`UPDATE data_mart_run SET type = 'CONNECTOR' WHERE type IS NULL`);

    await queryRunner.query(`UPDATE data_mart_run SET status = 'FAILED' WHERE status IS NULL`);

    await queryRunner.query(`
      UPDATE data_mart_run 
      SET logs = NULL 
      WHERE logs IS NOT NULL 
        AND CAST(logs AS CHAR) = '[]'
    `);

    await queryRunner.query(`
      UPDATE data_mart_run 
      SET errors = NULL 
      WHERE errors IS NOT NULL 
        AND CAST(errors AS CHAR) = '[]'
    `);

    await queryRunner.query(`
      UPDATE data_mart_run
      SET definitionRun = (
        SELECT definition
        FROM data_mart
        WHERE data_mart.id = data_mart_run.dataMartId
      )
      WHERE definitionRun IS NULL
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Migration rollback is not possible
  }
}
