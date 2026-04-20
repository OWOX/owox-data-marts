import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { getTable } from './migration-utils';

export class AddBlendedFieldsConfigToDataMart1776616688332 implements MigrationInterface {
  public readonly name = 'AddBlendedFieldsConfigToDataMart1776616688332';

  private readonly TABLE = 'data_mart';
  private readonly COLUMN = 'blendedFieldsConfig';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE);
    const hasColumn = table.columns.some(c => c.name === this.COLUMN);
    if (!hasColumn) {
      await queryRunner.addColumn(
        table,
        new TableColumn({
          name: this.COLUMN,
          type: 'json',
          isNullable: true,
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE);
    const hasColumn = table.columns.some(c => c.name === this.COLUMN);
    if (hasColumn) {
      await queryRunner.dropColumn(table, this.COLUMN);
    }
  }
}
