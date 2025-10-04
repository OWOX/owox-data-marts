import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateReportTable1750350724549 implements MigrationInterface {
  name = 'CreateReportTable1750350724549';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'report',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'title', type: 'varchar', isNullable: false },
          { name: 'dataMartId', type: 'varchar', isNullable: false },
          { name: 'dataDestinationId', type: 'varchar', isNullable: false },
          { name: 'destinationConfig', type: 'json', isNullable: false },
          { name: 'lastRunAt', type: 'datetime', isNullable: true },
          { name: 'lastRunStatus', type: 'varchar', isNullable: true },
          { name: 'lastRunError', type: 'varchar', isNullable: true },
          { name: 'runsCount', type: 'int', isNullable: false, default: 0 },
          { name: 'createdById', type: 'varchar', isNullable: false },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );
    await queryRunner.createForeignKey(
      'report',
      new TableForeignKey({
        columnNames: ['dataMartId'],
        referencedTableName: 'data_mart',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      })
    );
    await queryRunner.createForeignKey(
      'report',
      new TableForeignKey({
        columnNames: ['dataDestinationId'],
        referencedTableName: 'data_destination',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'report');
  }
}
