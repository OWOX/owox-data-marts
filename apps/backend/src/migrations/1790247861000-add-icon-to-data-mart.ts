import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { getTable } from './migration-utils';

export class AddIconToDataMart1790247861000 implements MigrationInterface {
  public readonly name = 'AddIconToDataMart1790247861000';

  private readonly TABLE = 'data_mart';
  private readonly COLUMN = new TableColumn({
    name: 'icon',
    type: 'varchar',
    length: '64',
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
