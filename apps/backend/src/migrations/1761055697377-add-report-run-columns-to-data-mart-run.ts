import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddReportRunColumnsToDataMartRun1761055697377 implements MigrationInterface {
  private readonly TABLE_NAME = 'data_mart_run';
  public readonly name = 'AddReportRunColumnsToDataMartRun1761055697377';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      this.TABLE_NAME,
      new TableColumn({
        name: 'reportId',
        type: 'varchar',
        isNullable: true,
        default: null,
      })
    );

    await queryRunner.createForeignKey(
      this.TABLE_NAME,
      new TableForeignKey({
        columnNames: ['reportId'],
        referencedTableName: 'report',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      })
    );

    await queryRunner.addColumn(
      this.TABLE_NAME,
      new TableColumn({
        name: 'reportDefinition',
        type: 'json',
        isNullable: true,
        default: null,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn(this.TABLE_NAME, 'reportDefinition');

    const table = await queryRunner.getTable(this.TABLE_NAME);
    const foreignKey = table?.foreignKeys.find(fk => fk.columnNames.indexOf('reportId') !== -1);
    if (foreignKey) {
      await queryRunner.dropForeignKey(this.TABLE_NAME, foreignKey);
    }

    await queryRunner.dropColumn(this.TABLE_NAME, 'reportId');
  }
}
