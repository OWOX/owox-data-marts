import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateProjectNotificationSettingsTable1769500000001 implements MigrationInterface {
  name = 'CreateProjectNotificationSettingsTable1769500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'project_notification_settings',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'projectId', type: 'varchar', isNullable: false },
          { name: 'notificationType', type: 'varchar', isNullable: false },
          { name: 'enabled', type: 'boolean', isNullable: false, default: false },
          { name: 'receivers', type: 'json', isNullable: false, default: "'[]'" },
          { name: 'webhookUrl', type: 'varchar', isNullable: true },
          { name: 'groupingDelayCron', type: 'varchar', isNullable: false, default: "'0 * * * *'" },
          { name: 'lastRunAt', type: 'datetime', isNullable: true },
          { name: 'nextRunAt', type: 'datetime', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          {
            name: 'uq_project_notification_settings_project_type',
            columnNames: ['projectId', 'notificationType'],
            isUnique: true,
          },
          {
            name: 'idx_project_notification_settings_project',
            columnNames: ['projectId'],
          },
          {
            name: 'idx_project_notification_settings_next_run',
            columnNames: ['enabled', 'nextRunAt'],
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'project_notification_settings');
  }
}
