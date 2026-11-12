import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { getTable } from './migration-utils';

export class AddPluginInstallationOwoxAi1793836800000 implements MigrationInterface {
  public readonly name = 'AddPluginInstallationOwoxAi1793836800000';

  private readonly TABLE = 'plugin_installation';
  private readonly COLUMN = new TableColumn({
    name: 'owoxAi',
    type: 'boolean',
    default: false,
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
