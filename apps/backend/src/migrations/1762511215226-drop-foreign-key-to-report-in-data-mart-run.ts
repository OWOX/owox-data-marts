import { MigrationInterface, QueryRunner, TableForeignKey } from 'typeorm';

export class DropForeignKeyToReportInDataMartRun1762511215226 implements MigrationInterface {
  private readonly TABLE_NAME = 'data_mart_run';
  public readonly name = 'DropForeignKeyToReportInDataMartRun1762511215226';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable(this.TABLE_NAME);
    const foreignKey = table?.foreignKeys.find(fk => fk.columnNames.indexOf('reportId') !== -1);
    if (foreignKey) {
      await queryRunner.dropForeignKey(this.TABLE_NAME, foreignKey);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable(this.TABLE_NAME);
    const foreignKey = table?.foreignKeys.find(fk => fk.columnNames.indexOf('reportId') !== -1);
    if (!foreignKey) {
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
    }
  }
}
