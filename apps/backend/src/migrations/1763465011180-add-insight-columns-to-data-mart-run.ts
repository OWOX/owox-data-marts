import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { getTable } from './migration-utils';

export class AddInsightColumnsToDataMartRun1763465011180 implements MigrationInterface {
  private readonly TABLE_NAME = 'data_mart_run';
  public readonly name = 'AddInsightColumnsToDataMartRun1763465011180';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'insightId',
        type: 'varchar',
        isNullable: true,
        default: null,
      })
    );

    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'insightDefinition',
        type: 'json',
        isNullable: true,
        default: null,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.dropColumn(table, 'insightDefinition');
    await queryRunner.dropColumn(table, 'insightId');
  }
}
