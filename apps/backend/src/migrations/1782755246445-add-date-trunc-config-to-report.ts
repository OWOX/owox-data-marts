import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { getTable } from './migration-utils';

export class AddDateTruncConfigToReport1782755246445 implements MigrationInterface {
  public readonly name = 'AddDateTruncConfigToReport1782755246445';

  private readonly TABLE = 'report';
  private readonly COLUMN = new TableColumn({
    name: 'dateTruncConfig',
    type: 'json',
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
