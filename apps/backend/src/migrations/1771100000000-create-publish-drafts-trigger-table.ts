import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreatePublishDraftsTriggerTable1771100000000 implements MigrationInterface {
  name = 'CreatePublishDraftsTriggerTable1771100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'publish_drafts_triggers',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'userId', type: 'varchar', isNullable: false },
          { name: 'projectId', type: 'varchar', isNullable: false },
          { name: 'dataStorageId', type: 'varchar', isNullable: false },
          { name: 'isActive', type: 'boolean', isNullable: false },
          { name: 'status', type: 'varchar', isNullable: false, default: "'IDLE'" },
          { name: 'version', type: 'int', isNullable: false },
          { name: 'uiResponse', type: 'json', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          {
            name: 'IDX_publish_drafts_trigger_status',
            columnNames: ['status', 'isActive'],
          },
          {
            name: 'IDX_publish_drafts_trigger_user',
            columnNames: ['userId'],
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'publish_drafts_triggers');
  }
}
