import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';
import { getTable } from './migration-utils';

export class AddReportRunColumnsToDataMartRun1761055697377 implements MigrationInterface {
  private readonly TABLE_NAME = 'data_mart_run';
  public readonly name = 'AddReportRunColumnsToDataMartRun1761055697377';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'reportId',
        type: 'varchar',
        isNullable: true,
        default: null,
      })
    );

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

    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'reportDefinition',
        type: 'json',
        isNullable: true,
        default: null,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.dropColumn(table, 'reportDefinition');

    const foreignKey = table.foreignKeys.find(fk => fk.columnNames.indexOf('reportId') !== -1);
    if (foreignKey) {
      await queryRunner.dropForeignKey(table, foreignKey);
    }

    await queryRunner.dropColumn(table, 'reportId');
  }
}
