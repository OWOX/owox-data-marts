import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddInsightColumnsToDataMartRun1763465011180 implements MigrationInterface {
  private readonly TABLE_NAME = 'data_mart_run';
  public readonly name = 'AddInsightColumnsToDataMartRun1763465011180';
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

    await queryRunner.addColumn(
      this.TABLE_NAME,
      new TableColumn({
        name: 'insightDefinition',
        type: 'json',
        isNullable: true,
        default: null,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn(this.TABLE_NAME, 'insightDefinition');
    await queryRunner.dropColumn(this.TABLE_NAME, 'insightId');
  }
}
