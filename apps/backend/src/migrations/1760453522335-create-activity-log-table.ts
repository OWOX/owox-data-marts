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
          { name: 'entityType', type: 'varchar', isNullable: true },
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
            columnNames: ['entityType', 'entityId'],
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
    await softDropTable(queryRunner, 'activity_log');
  }
}
