import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

const CREDENTIAL = 'credential';
const COLUMN = 'aiModelMappingSources';

export class AddCredentialAiModelMappingSources1787788800002 implements MigrationInterface {
  public readonly name = 'AddCredentialAiModelMappingSources1787788800002';

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
