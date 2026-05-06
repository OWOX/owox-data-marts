import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { getTable } from './migration-utils';

export class AddOutputControlsToReport1776616688334 implements MigrationInterface {
  public readonly name = 'AddOutputControlsToReport1776616688334';

  private readonly TABLE = 'report';
  private readonly NEW_COLUMNS: TableColumn[] = [
    new TableColumn({ name: 'filterConfig', type: 'json', isNullable: true }),
    new TableColumn({ name: 'sortConfig', type: 'json', isNullable: true }),
    new TableColumn({ name: 'limitConfig', type: 'int', isNullable: true }),
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE);
    for (const column of this.NEW_COLUMNS) {
      const exists = table.columns.some(c => c.name === column.name);
      if (!exists) {
        await queryRunner.addColumn(table, column);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE);
    for (const column of this.NEW_COLUMNS) {
      const exists = table.columns.some(c => c.name === column.name);
      if (exists) {
        await queryRunner.dropColumn(table, column.name);
      }
    }
  }
}
