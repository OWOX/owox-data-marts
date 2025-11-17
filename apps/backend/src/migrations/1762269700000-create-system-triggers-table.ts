import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateSystemTriggersTable1762269700000 implements MigrationInterface {
  name = 'CreateSystemTriggersTable1762269700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'system_triggers',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'type', type: 'varchar', isNullable: false },
          { name: 'cronExpression', type: 'varchar', isNullable: false },
          { name: 'timeZone', type: 'varchar', isNullable: false },
          { name: 'nextRunTimestamp', type: 'datetime', isNullable: true },
          { name: 'lastRunTimestamp', type: 'datetime', isNullable: true },
          { name: 'isActive', type: 'boolean', isNullable: false },
          { name: 'status', type: 'varchar', isNullable: false, default: "'IDLE'" },
          { name: 'version', type: 'int', isNullable: false },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          { name: 'uq_system_trigger_type', columnNames: ['type'], isUnique: true },
          {
            name: 'idx_system_trigger_ready',
            columnNames: ['isActive', 'status', 'nextRunTimestamp'],
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'system_triggers');
  }
}
