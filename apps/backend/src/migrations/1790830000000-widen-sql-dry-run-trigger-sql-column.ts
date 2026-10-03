import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { getTable } from './migration-utils';

/**
 * Widens `sql_dry_run_triggers.sql` from `text` (65535 bytes on MySQL) to `mediumtext`
 * (16 MB). Dry-run SQL over 64 KB failed the INSERT with ER_DATA_TOO_LONG and surfaced
 * as a 500.
 *
 * MySQL only: on SQLite a `text` column is already unbounded, and TypeORM's SQLite
 * driver does not support `mediumtext` at all.
 */
export class WidenSqlDryRunTriggerSqlColumn1790830000000 implements MigrationInterface {
  private readonly TABLE_NAME = 'sql_dry_run_triggers';
  public readonly name = 'WidenSqlDryRunTriggerSqlColumn1790830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'mysql') {
      return;
    }

    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.changeColumn(
      table,
      'sql',
      new TableColumn({
        name: 'sql',
        type: 'mediumtext',
        isNullable: false,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'mysql') {
      return;
    }

    // Rows wider than `text` can hold would fail the narrowing ALTER in strict mode.
    // Dry-run triggers are ephemeral validation requests, so dropping them is safe.
    await queryRunner.query(`DELETE FROM ${this.TABLE_NAME} WHERE LENGTH(\`sql\`) > 65535`);

    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.changeColumn(
      table,
      'sql',
      new TableColumn({
        name: 'sql',
        type: 'text',
        isNullable: false,
      })
    );
  }
}
