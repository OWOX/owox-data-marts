import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeleteLookerStudioReports1755508405000 implements MigrationInterface {
  name = 'DeleteLookerStudioReports1755508405000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Delete all reports associated with destinations of type LOOKER_STUDIO.
    await queryRunner.query(`
      DELETE FROM report 
      WHERE dataDestinationId IN (
        SELECT id FROM data_destination 
        WHERE type = 'LOOKER_STUDIO'
      )
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Migration rollback is not possible as data has been deleted
  }
}
