import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateInsightRunTriggerTable1763465015994 implements MigrationInterface {
  name = 'CreateInsightRunTriggerTable1763465015994';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'insight_run_triggers',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'userId', type: 'varchar', isNullable: false },
          { name: 'projectId', type: 'varchar', isNullable: false },
          { name: 'dataMartId', type: 'varchar', isNullable: false },
          { name: 'insightId', type: 'varchar', isNullable: false },
          { name: 'isActive', type: 'boolean', isNullable: false },
          { name: 'status', type: 'varchar', isNullable: false, default: "'IDLE'" },
          { name: 'version', type: 'int', isNullable: false },
          { name: 'uiResponse', type: 'json', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          {
            name: 'idx_insight_run_trigger_status',
            columnNames: ['status', 'isActive'],
          },
          {
            name: 'idx_insight_run_trigger_user',
            columnNames: ['userId'],
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'insight_run_triggers');
  }
}
