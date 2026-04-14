import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateProjectSetupUserProgressTable1776063106000 implements MigrationInterface {
  name = 'CreateProjectSetupUserProgressTable1776063106000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'project_setup_user_progress',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'projectId', type: 'varchar', isNullable: false },
          { name: 'userId', type: 'varchar', isNullable: false },
          { name: 'stepsSchemaVersion', type: 'int', isNullable: false, default: 1 },
          { name: 'steps', type: 'json', isNullable: false },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'project_setup_user_progress',
      new TableIndex({
        name: 'idx_psup_projectId_userId',
        columnNames: ['projectId', 'userId'],
        isUnique: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'project_setup_user_progress');
  }
}
