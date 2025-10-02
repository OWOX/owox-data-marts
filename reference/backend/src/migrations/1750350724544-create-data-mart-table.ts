import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';
import { softDropTable } from './helper';

export class CreateDataMartTable1750350724544 implements MigrationInterface {
  name = 'CreateDataMartTable1750350724544';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'data_mart',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'title', type: 'varchar', isNullable: false },
          { name: 'definitionType', type: 'varchar', isNullable: true },
          { name: 'definition', type: 'json', isNullable: true },
          { name: 'status', type: 'varchar', isNullable: false, default: "'DRAFT'" },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'projectId', type: 'varchar', isNullable: false },
          { name: 'createdById', type: 'varchar', isNullable: false },
          { name: 'deletedAt', type: 'datetime', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'storageId', type: 'varchar', isNullable: true },
          { name: 'schema', type: 'json', isNullable: true },
        ],
      }),
      true
    );
    await queryRunner.createForeignKey(
      'data_mart',
      new TableForeignKey({
        columnNames: ['storageId'],
        referencedTableName: 'data_storage',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'data_mart');
  }
}
