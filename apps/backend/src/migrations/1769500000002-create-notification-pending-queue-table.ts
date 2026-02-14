import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateNotificationPendingQueueTable1769500000002 implements MigrationInterface {
  name = 'CreateNotificationPendingQueueTable1769500000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'notification_pending_queue',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'notificationType', type: 'varchar', isNullable: false },
          { name: 'projectId', type: 'varchar', isNullable: false },
          { name: 'dataMartId', type: 'varchar', isNullable: false, default: "''" },
          { name: 'runId', type: 'varchar', isNullable: false, default: "''" },
          { name: 'payload', type: 'json', isNullable: false, default: "'{}'" },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          {
            name: 'uq_notification_pending_queue_type_project_dm_run',
            columnNames: ['notificationType', 'projectId', 'dataMartId', 'runId'],
            isUnique: true,
          },
          {
            name: 'idx_notification_pending_queue_created',
            columnNames: ['createdAt'],
          },
          {
            name: 'idx_notification_pending_queue_project_type',
            columnNames: ['projectId', 'notificationType'],
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'notification_pending_queue');
  }
}
