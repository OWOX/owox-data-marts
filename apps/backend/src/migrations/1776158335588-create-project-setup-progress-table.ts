import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateProjectSetupProgressTable1776158335588 implements MigrationInterface {
  name = 'CreateProjectSetupProgressTable1776158335588';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'project_setup_progress',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'projectId', type: 'varchar', isNullable: false },
          { name: 'stepsSchemaVersion', type: 'int', isNullable: false, default: 1 },
          { name: 'steps', type: 'json', isNullable: false },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'project_setup_progress',
      new TableIndex({
        name: 'idx_psp_projectId',
        columnNames: ['projectId'],
        isUnique: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'project_setup_progress');
  }
}
