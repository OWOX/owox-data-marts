import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { getTable } from './migration-utils';

export class AddInsightTemplateColumnsToDataMartRun1770100000003 implements MigrationInterface {
  private readonly TABLE_NAME = 'data_mart_run';
  public readonly name = 'AddInsightTemplateColumnsToDataMartRun1770100000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'insightTemplateId',
        type: 'varchar',
        isNullable: true,
        default: null,
      })
    );

    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'insightTemplateDefinition',
        type: 'json',
        isNullable: true,
        default: null,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.dropColumn(table, 'insightTemplateDefinition');
    await queryRunner.dropColumn(table, 'insightTemplateId');
  }
}
