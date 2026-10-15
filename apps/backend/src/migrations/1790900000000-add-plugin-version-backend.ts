import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

const TABLE = 'plugin_version';
const COLUMN = 'backend';

export class AddPluginVersionBackend1790900000000 implements MigrationInterface {
  public readonly name = 'AddPluginVersionBackend1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn(TABLE, COLUMN))) {
      await queryRunner.addColumn(
        TABLE,
        new TableColumn({ name: COLUMN, type: 'json', isNullable: true })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn(TABLE, COLUMN)) {
      await queryRunner.dropColumn(TABLE, COLUMN);
    }
  }
}
