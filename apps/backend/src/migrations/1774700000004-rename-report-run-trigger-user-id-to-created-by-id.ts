import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameReportRunTriggerUserIdToCreatedById1774700000004 implements MigrationInterface {
  public readonly name = 'RenameReportRunTriggerUserIdToCreatedById1774700000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasOldColumn = await queryRunner.hasColumn('report_run_triggers', 'userId');
    const hasNewColumn = await queryRunner.hasColumn('report_run_triggers', 'createdById');

    if (hasOldColumn && !hasNewColumn) {
      await queryRunner.renameColumn('report_run_triggers', 'userId', 'createdById');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasNewColumn = await queryRunner.hasColumn('report_run_triggers', 'createdById');
    const hasOldColumn = await queryRunner.hasColumn('report_run_triggers', 'userId');

    if (hasNewColumn && !hasOldColumn) {
      await queryRunner.renameColumn('report_run_triggers', 'createdById', 'userId');
    }
  }
}
