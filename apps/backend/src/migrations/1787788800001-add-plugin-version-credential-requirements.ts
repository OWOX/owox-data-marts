import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

const TABLE = 'plugin_version';
const COLUMN = 'credentialRequirements';

export class AddPluginVersionCredentialRequirements1787788800001 implements MigrationInterface {
  public readonly name = 'AddPluginVersionCredentialRequirements1787788800001';

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
