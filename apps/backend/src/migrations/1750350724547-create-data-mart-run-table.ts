import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateDataMartRunTable1750350724547 implements MigrationInterface {
  name = 'CreateDataMartRunTable1750350724547';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'data_mart_run',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'dataMartId', type: 'varchar', isNullable: false },
          { name: 'definitionRun', type: 'json', isNullable: true },
          { name: 'status', type: 'varchar', isNullable: true },
          { name: 'logs', type: 'json', isNullable: true },
          { name: 'errors', type: 'json', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );
    await queryRunner.createForeignKey(
      'data_mart_run',
      new TableForeignKey({
        columnNames: ['dataMartId'],
        referencedTableName: 'data_mart',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'data_mart_run');
  }
}
