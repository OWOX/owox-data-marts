import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateProjectProjectionTable1764094261000 implements MigrationInterface {
  public readonly name = 'CreateProjectProjectionTable1764094261000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create project_projection with simple cross-DB types
    await queryRunner.createTable(
      new Table({
        name: 'project_projection',
        columns: [
          { name: 'projectId', type: 'varchar', isPrimary: true },
          { name: 'projectTitle', type: 'varchar', isNullable: false },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Safe rollback: rename the table instead of dropping it
    await softDropTable(queryRunner, 'project_projection');
  }
}
