import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './helper';

export class CreateDataStorageTable1750350724543 implements MigrationInterface {
  name = 'CreateDataStorageTable1750350724543';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'data_storage',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'type', type: 'varchar', isNullable: false },
          { name: 'projectId', type: 'varchar', isNullable: false },
          { name: 'title', type: 'varchar', isNullable: true },
          { name: 'credentials', type: 'json', isNullable: true },
          { name: 'config', type: 'json', isNullable: true },
          { name: 'deletedAt', type: 'datetime', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'data_storage');
  }
}
