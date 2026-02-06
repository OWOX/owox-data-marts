import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateSyncGcpStoragesForProjectTriggerTable1769769180002 implements MigrationInterface {
  name = 'CreateSyncGcpStoragesForProjectTriggerTable1769769180002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'sync_gcp_storages_for_project_triggers',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'projectId', type: 'varchar', isNullable: false },
          { name: 'gcpProjectsCount', type: 'int', isNullable: false, default: 0 },
          { name: 'isActive', type: 'boolean', isNullable: false },
          { name: 'status', type: 'varchar', isNullable: false, default: "'IDLE'" },
          { name: 'version', type: 'int', isNullable: false },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          {
            name: 'IDX_sync_gcp_storages_for_project_trigger_status',
            columnNames: ['status', 'isActive'],
          },
          {
            name: 'IDX_sync_gcp_storages_for_project_trigger_project',
            columnNames: ['projectId'],
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'sync_gcp_storages_for_project_triggers');
  }
}
