import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { getTable } from './migration-utils';

export class AddOutputToInsightTable1763465015992 implements MigrationInterface {
  private readonly TABLE_NAME = 'insight';
  public readonly name = 'AddOutputToInsightTable1763465015992';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'output',
        type: 'text',
        isNullable: true,
        default: null,
      })
    );

    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'outputUpdatedAt',
        type: 'datetime',
        isNullable: true,
        default: null,
      })
    );

    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'lastManualDataMartRunId',
        type: 'varchar',
        isNullable: true,
        default: null,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.dropColumn(table, 'lastManualDataMartRunId');
    await queryRunner.dropColumn(table, 'outputUpdatedAt');
    await queryRunner.dropColumn(table, 'output');
  }
}
