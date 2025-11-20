import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddOutputToInsightTable1763465015992 implements MigrationInterface {
  private readonly TABLE_NAME = 'insight';
  public readonly name = 'AddOutputToInsightTable1763465015992';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      this.TABLE_NAME,
      new TableColumn({
        name: 'output',
        type: 'text',
        isNullable: true,
        default: null,
      })
    );
    await queryRunner.addColumn(
      this.TABLE_NAME,
      new TableColumn({
        name: 'outputUpdatedAt',
        type: 'datetime',
        isNullable: true,
        default: null,
      })
    );
    await queryRunner.addColumn(
      this.TABLE_NAME,
      new TableColumn({
        name: 'lastDataMartRunId',
        type: 'varchar',
        isNullable: true,
        default: null,
      })
    );
    await queryRunner.createForeignKey(
      this.TABLE_NAME,
      new TableForeignKey({
        columnNames: ['lastDataMartRunId'],
        referencedTableName: 'data_mart_run',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable(this.TABLE_NAME);
    const fk = table?.foreignKeys.find(f => f.columnNames.includes('lastDataMartRunId'));
    if (fk) {
      await queryRunner.dropForeignKey(this.TABLE_NAME, fk);
    }
    await queryRunner.dropColumn(this.TABLE_NAME, 'lastDataMartRunId');
    await queryRunner.dropColumn('insight', 'outputUpdatedAt');
    await queryRunner.dropColumn('insight', 'output');
  }
}
