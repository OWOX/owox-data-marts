import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens `sql_dry_run_triggers.sql` from `text` (65535 bytes on MySQL) to `mediumtext`
 * (16 MB). Dry-run SQL over 64 KB failed the INSERT with ER_DATA_TOO_LONG and surfaced
 * as a 500.
 *
 * MySQL only: on SQLite a `text` column is already unbounded, and TypeORM's SQLite
 * driver does not support `mediumtext` at all.
 *
 * Raw `ALTER TABLE ... MODIFY` on purpose. On MySQL, `queryRunner.changeColumn` drops and
 * re-adds the column whenever the type changes: it empties every row, moves the column, and
 * leaves the table without `sql` between the two statements.
 */
export class WidenSqlDryRunTriggerSqlColumn1790830000000 implements MigrationInterface {
  public readonly name = 'WidenSqlDryRunTriggerSqlColumn1790830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'mysql') {
      return;
    }

    await queryRunner.query('ALTER TABLE `sql_dry_run_triggers` MODIFY `sql` MEDIUMTEXT NOT NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'mysql') {
      return;
    }

    // Rows wider than `text` can hold would fail the narrowing ALTER in strict mode.
    // Dry-run triggers are ephemeral validation requests, so dropping them is safe.
    await queryRunner.query('DELETE FROM `sql_dry_run_triggers` WHERE LENGTH(`sql`) > 65535');
    await queryRunner.query('ALTER TABLE `sql_dry_run_triggers` MODIFY `sql` TEXT NOT NULL');
  }
}
