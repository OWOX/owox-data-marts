import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateAiHelperTriggerTable1778852008394 implements MigrationInterface {
  name = 'CreateAiHelperTriggerTable1778852008394';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'ai_helper_triggers',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'userId', type: 'varchar', isNullable: false },
          { name: 'projectId', type: 'varchar', isNullable: false },
          { name: 'dataMartId', type: 'varchar', isNullable: false },
          { name: 'scope', type: 'varchar', isNullable: false },
          { name: 'useSample', type: 'boolean', isNullable: false },
          { name: 'fieldName', type: 'varchar', isNullable: true },
          { name: 'isActive', type: 'boolean', isNullable: false },
          { name: 'status', type: 'varchar', isNullable: false, default: "'IDLE'" },
          { name: 'version', type: 'int', isNullable: false },
          { name: 'uiResponse', type: 'json', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          {
            name: 'IDX_ai_helper_trigger_status',
            columnNames: ['status', 'isActive'],
          },
          {
            name: 'IDX_ai_helper_trigger_user',
            columnNames: ['userId'],
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'ai_helper_triggers');
  }
}
