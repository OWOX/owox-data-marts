import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateAiAssistantMessageTable1770100000007 implements MigrationInterface {
  name = 'CreateAiAssistantMessageTable1770100000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'ai_assistant_message',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'sessionId', type: 'varchar', isNullable: false },
          { name: 'role', type: 'varchar', isNullable: false },
          { name: 'content', type: 'text', isNullable: false },
          { name: 'proposedActions', type: 'json', isNullable: true, default: null },
          { name: 'sqlCandidate', type: 'text', isNullable: true, default: null },
          { name: 'meta', type: 'json', isNullable: true, default: null },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      'ai_assistant_message',
      new TableForeignKey({
        columnNames: ['sessionId'],
        referencedTableName: 'ai_assistant_session',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      })
    );

    await queryRunner.createIndex(
      'ai_assistant_message',
      new TableIndex({
        name: 'idx_ai_src_msg_session_createdAt',
        columnNames: ['sessionId', 'createdAt'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'ai_assistant_message');
  }
}
