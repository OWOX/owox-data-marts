import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

const CREDENTIAL = 'credential';
const COLUMN = 'publicMetadata';

export class AddCredentialPublicMetadata1791000000000 implements MigrationInterface {
  public readonly name = 'AddCredentialPublicMetadata1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (
      (await queryRunner.hasTable(CREDENTIAL)) &&
      !(await queryRunner.hasColumn(CREDENTIAL, COLUMN))
    ) {
      await queryRunner.addColumn(
        CREDENTIAL,
        new TableColumn({ name: COLUMN, type: 'json', isNullable: true })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      (await queryRunner.hasTable(CREDENTIAL)) &&
      (await queryRunner.hasColumn(CREDENTIAL, COLUMN))
    ) {
      await queryRunner.dropColumn(CREDENTIAL, COLUMN);
    }
  }
}
