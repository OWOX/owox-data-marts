import { MigrationInterface, QueryRunner } from 'typeorm';

const TABLE = 'plugin_action_execution';

/**
 * Changes `plugin_action_execution.input` and `.result` from `json` to `mediumtext` (16 MB), holding
 * `JSON.stringify` text. TypeORM parses a MySQL `json` value a second time, so a stored string such as
 * "12345" read back as a number; MySQL's `json` also reorders keys and refuses lone surrogates.
 *
 * MySQL only: on SQLite TypeORM already stored `json` as `JSON.stringify` text, so existing rows read
 * back unchanged, and TypeORM's SQLite driver does not support `mediumtext` at all.
 *
 * Raw `ALTER TABLE ... MODIFY` on purpose. On MySQL, `queryRunner.changeColumn` drops and re-adds the
 * column whenever the type changes: it empties every row. Running `up` twice changes nothing.
 */
export class StorePluginActionPayloadsAsText1790900000003 implements MigrationInterface {
  public readonly name = 'StorePluginActionPayloadsAsText1790900000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'mysql' || !(await queryRunner.hasTable(TABLE))) {
      return;
    }

    await queryRunner.query(
      'ALTER TABLE `plugin_action_execution` MODIFY `input` MEDIUMTEXT NULL, MODIFY `result` MEDIUMTEXT NULL'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'mysql' || !(await queryRunner.hasTable(TABLE))) {
      return;
    }

    // `json` refuses some text kept here (a lone surrogate, a key over 64 KiB); payloads live 24 hours anyway.
    await queryRunner.query('UPDATE `plugin_action_execution` SET `input` = NULL, `result` = NULL');
    await queryRunner.query(
      'ALTER TABLE `plugin_action_execution` MODIFY `input` JSON NULL, MODIFY `result` JSON NULL'
    );
  }
}
