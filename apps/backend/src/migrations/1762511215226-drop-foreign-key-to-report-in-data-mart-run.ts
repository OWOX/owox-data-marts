import { MigrationInterface, QueryRunner, TableForeignKey } from 'typeorm';
import { getTable } from './migration-utils';

export class DropForeignKeyToReportInDataMartRun1762511215226 implements MigrationInterface {
  private readonly TABLE_NAME = 'data_mart_run';
  public readonly name = 'DropForeignKeyToReportInDataMartRun1762511215226';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    const foreignKey = table.foreignKeys.find(fk => fk.columnNames.indexOf('reportId') !== -1);
    if (foreignKey) {
      await queryRunner.dropForeignKey(table, foreignKey);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    const foreignKey = table.foreignKeys.find(fk => fk.columnNames.indexOf('reportId') !== -1);
    if (!foreignKey) {
      await queryRunner.createForeignKey(
        table,
        new TableForeignKey({
          columnNames: ['reportId'],
          referencedTableName: 'report',
          referencedColumnNames: ['id'],
          onDelete: 'NO ACTION',
          onUpdate: 'NO ACTION',
        })
      );
    }
  }
}
