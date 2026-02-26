import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateAiAssistantApplyActionTable1770100000009 implements MigrationInterface {
  name = 'CreateAiAssistantApplyActionTable1770100000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'ai_assistant_apply_actions',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'sessionId', type: 'varchar', isNullable: false },
          { name: 'requestId', type: 'varchar', length: '255', isNullable: false },
          { name: 'createdById', type: 'varchar', isNullable: false },
          { name: 'response', type: 'json', isNullable: true, default: null },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          {
            name: 'uq_ai_assistant_apply_action_session_request',
            columnNames: ['sessionId', 'requestId'],
            isUnique: true,
          },
          {
            name: 'idx_ai_assistant_apply_action_createdBy',
            columnNames: ['createdById'],
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'ai_assistant_apply_actions');
  }
}
