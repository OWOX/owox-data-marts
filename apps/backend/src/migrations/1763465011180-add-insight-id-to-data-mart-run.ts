import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddInsightIdToDataMartRun1763465011180 implements MigrationInterface {
  private readonly TABLE_NAME = 'data_mart_run';
  public readonly name = 'AddInsightIdToDataMartRun1763465011180';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      this.TABLE_NAME,
      new TableColumn({
        name: 'insightId',
        type: 'varchar',
        isNullable: true,
        default: null,
      })
    );

    await queryRunner.createForeignKey(
      this.TABLE_NAME,
      new TableForeignKey({
        columnNames: ['insightId'],
        referencedTableName: 'insight',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable(this.TABLE_NAME);
    const foreignKey = table?.foreignKeys.find(fk => fk.columnNames.indexOf('insightId') !== -1);
    if (foreignKey) {
      await queryRunner.dropForeignKey(this.TABLE_NAME, foreignKey);
    }

    await queryRunner.dropColumn(this.TABLE_NAME, 'insightId');
  }
}
