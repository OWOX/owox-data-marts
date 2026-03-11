import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateConnectorRunTriggerTable1773000000000 implements MigrationInterface {
  name = 'CreateConnectorRunTriggerTable1773000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'connector_run_triggers',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'dataMartId', type: 'varchar', isNullable: false },
          { name: 'projectId', type: 'varchar', isNullable: false },
          { name: 'createdById', type: 'varchar', isNullable: false },
          { name: 'payload', type: 'json', isNullable: true },
          { name: 'dataMartRunId', type: 'varchar', isNullable: false },
          { name: 'runType', type: 'varchar', isNullable: false },
          { name: 'isActive', type: 'boolean', isNullable: false },
          { name: 'status', type: 'varchar', isNullable: false, default: "'IDLE'" },
          { name: 'version', type: 'int', isNullable: false, default: 1 },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          {
            name: 'IDX_connector_run_trigger_status',
            columnNames: ['status', 'isActive'],
          },
          {
            name: 'IDX_connector_run_trigger_project',
            columnNames: ['projectId'],
          },
          {
            name: 'IDX_connector_run_trigger_created',
            columnNames: ['createdAt'],
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'connector_run_triggers');
  }
}
