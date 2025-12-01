import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateUserProjectionTable1764094260000 implements MigrationInterface {
  public readonly name = 'CreateUserProjectionTable1764094260000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create user_projection with simple cross-DB types
    await queryRunner.createTable(
      new Table({
        name: 'user_projection',
        columns: [
          { name: 'userId', type: 'varchar', isPrimary: true },
          { name: 'fullName', type: 'varchar', isNullable: true },
          { name: 'email', type: 'varchar', isNullable: true },
          { name: 'avatar', type: 'varchar', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Safe rollback: rename the table instead of dropping it
    await softDropTable(queryRunner, 'user_projection');
  }
}
