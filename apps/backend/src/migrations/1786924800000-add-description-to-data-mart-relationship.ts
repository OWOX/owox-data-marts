import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { getTable } from './migration-utils';

export class AddDescriptionToDataMartRelationship1786924800000 implements MigrationInterface {
  public readonly name = 'AddDescriptionToDataMartRelationship1786924800000';

  private readonly TABLE = 'data_mart_relationship';
  private readonly COLUMN = new TableColumn({
    name: 'description',
    type: 'text',
    isNullable: true,
  });

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE);
    const exists = table.columns.some(c => c.name === this.COLUMN.name);
    if (!exists) {
      await queryRunner.addColumn(table, this.COLUMN);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE);
    const exists = table.columns.some(c => c.name === this.COLUMN.name);
    if (exists) {
      await queryRunner.dropColumn(table, this.COLUMN.name);
    }
  }
}
