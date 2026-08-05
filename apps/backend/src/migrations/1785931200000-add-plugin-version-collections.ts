import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

const TABLE = 'plugin_version';
const COLUMN = 'collections';

export class AddPluginVersionCollections1785931200000 implements MigrationInterface {
  public readonly name = 'AddPluginVersionCollections1785931200000';

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
