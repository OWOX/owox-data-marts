import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateActivityLogTable1760453522335 implements MigrationInterface {
  name = 'CreateActivityLogTable1760453522335';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'activity_log',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'occuredAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'eventType', type: 'varchar', isNullable: false },
          { name: 'entityName', type: 'varchar', isNullable: true },
          { name: 'entityId', type: 'varchar', isNullable: true },
          { name: 'projectId', type: 'varchar', isNullable: true },
          { name: 'userId', type: 'varchar', isNullable: true },
          { name: 'status', type: 'varchar', isNullable: true },
          { name: 'uiDetails', type: 'json', isNullable: true },
          { name: 'details', type: 'json', isNullable: true },
        ],
        indices: [
          {
            name: 'idx_activity_log_occurredAt',
            columnNames: ['occuredAt'],
          },
          {
            name: 'idx_activity_log_eventType',
            columnNames: ['eventType'],
          },
          {
            name: 'idx_activity_log_entity',
            columnNames: ['entityName', 'entityId'],
          },
          {
            name: 'idx_activity_log_projectId',
            columnNames: ['projectId'],
          },
          {
            name: 'idx_activity_log_userId',
            columnNames: ['userId'],
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indices before soft dropping the table to avoid naming conflicts
    await queryRunner.dropIndex('activity_log', 'idx_activity_log_occurred_at');
    await queryRunner.dropIndex('activity_log', 'idx_activity_log_eventType');
    await queryRunner.dropIndex('activity_log', 'idx_activity_log_entity');
    await queryRunner.dropIndex('activity_log', 'idx_activity_log_project');
    await queryRunner.dropIndex('activity_log', 'idx_activity_log_user');

    await softDropTable(queryRunner, 'activity_log');
  }
}
