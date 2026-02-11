import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateSyncDataMartsByGcpTriggerTable1769769180001 implements MigrationInterface {
  name = 'CreateSyncDataMartsByGcpTriggerTable1769769180001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'sync_data_marts_by_gcp_triggers',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'gcpProjectId', type: 'varchar', isNullable: false },
          { name: 'dataMartsCount', type: 'int', isNullable: false, default: 0 },
          { name: 'isActive', type: 'boolean', isNullable: false },
          { name: 'status', type: 'varchar', isNullable: false, default: "'IDLE'" },
          { name: 'version', type: 'int', isNullable: false },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          {
            name: 'IDX_sync_data_marts_by_gcp_trigger_status',
            columnNames: ['status', 'isActive'],
          },
          {
            name: 'IDX_sync_data_marts_by_gcp_trigger_gcp_project',
            columnNames: ['gcpProjectId'],
            isUnique: true,
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'sync_data_marts_by_gcp_triggers');
  }
}
