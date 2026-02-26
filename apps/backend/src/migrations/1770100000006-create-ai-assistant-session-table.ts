import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateAiAssistantSessionTable1770100000006 implements MigrationInterface {
  name = 'CreateAiAssistantSessionTable1770100000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'ai_assistant_session',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'dataMartId', type: 'varchar', isNullable: false },
          { name: 'scope', type: 'varchar', isNullable: false },
          { name: 'status', type: 'varchar', isNullable: false, default: "'draft'" },
          { name: 'templateId', type: 'varchar', isNullable: true, default: null },
          { name: 'createdById', type: 'varchar', isNullable: false },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      'ai_assistant_session',
      new TableForeignKey({
        columnNames: ['dataMartId'],
        referencedTableName: 'data_mart',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      })
    );

    await queryRunner.createForeignKey(
      'ai_assistant_session',
      new TableForeignKey({
        columnNames: ['templateId'],
        referencedTableName: 'insight_template',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      })
    );

    await queryRunner.createIndex(
      'ai_assistant_session',
      new TableIndex({
        name: 'idx_ai_src_sess_dataMart_createdBy_updatedAt',
        columnNames: ['dataMartId', 'createdById', 'updatedAt'],
      })
    );

    await queryRunner.createIndex(
      'ai_assistant_session',
      new TableIndex({
        name: 'idx_ai_src_sess_templateId',
        columnNames: ['templateId'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'ai_assistant_session');
  }
}
