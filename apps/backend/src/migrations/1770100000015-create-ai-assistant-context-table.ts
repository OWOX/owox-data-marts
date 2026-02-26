import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateAiAssistantContextTable1770100000015 implements MigrationInterface {
  name = 'CreateAiAssistantContextTable1770100000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'ai_assistant_context',
        columns: [
          { name: 'sessionId', type: 'varchar', isPrimary: true },
          { name: 'conversationSnapshot', type: 'json', isNullable: true, default: null },
          { name: 'stateSnapshot', type: 'json', isNullable: true, default: null },
          { name: 'version', type: 'integer', isNullable: false, default: '1' },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          {
            name: 'idx_ai_assistant_context_updatedAt',
            columnNames: ['updatedAt'],
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'ai_assistant_context');
  }
}
