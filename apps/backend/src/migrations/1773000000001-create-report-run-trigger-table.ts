import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateReportRunTriggerTable1773000000001 implements MigrationInterface {
  name = 'CreateReportRunTriggerTable1773000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'report_run_triggers',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'reportId', type: 'varchar', isNullable: false },
          { name: 'userId', type: 'varchar', isNullable: false },
          { name: 'projectId', type: 'varchar', isNullable: false },
          { name: 'dataMartRunId', type: 'varchar', isNullable: true },
          { name: 'runType', type: 'varchar', isNullable: false },
          { name: 'isActive', type: 'boolean', isNullable: false },
          { name: 'status', type: 'varchar', isNullable: false, default: "'IDLE'" },
          { name: 'version', type: 'int', isNullable: false },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          {
            name: 'IDX_report_run_trigger_status',
            columnNames: ['status', 'isActive'],
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'report_run_triggers');
  }
}
