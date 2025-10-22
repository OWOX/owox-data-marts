import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeleteReportsOfDeletedDataMarts1761136860001 implements MigrationInterface {
  name = 'DeleteReportsOfDeletedDataMarts1761136860001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove reports that reference data marts which have been soft-deleted (deletedAt IS NOT NULL).
    await queryRunner.query(`
      DELETE FROM report
      WHERE dataMartId IN (
        SELECT id FROM data_mart WHERE deletedAt IS NOT NULL
      )
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Irreversible migration: deleted data cannot be restored.
  }
}
