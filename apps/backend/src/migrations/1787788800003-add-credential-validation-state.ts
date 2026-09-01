import type { MigrationInterface, QueryRunner } from 'typeorm';
import { TableColumn } from 'typeorm';

const CREDENTIAL = 'credential';

export class AddCredentialValidationState1787788800003 implements MigrationInterface {
  public readonly name = 'AddCredentialValidationState1787788800003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable(CREDENTIAL))) return;
    if (!(await queryRunner.hasColumn(CREDENTIAL, 'validationState'))) {
      await queryRunner.addColumn(
        CREDENTIAL,
        new TableColumn({
          name: 'validationState',
          type: 'varchar',
          length: '16',
          default: "'unknown'",
        })
      );
    }
    if (!(await queryRunner.hasColumn(CREDENTIAL, 'validationMessage'))) {
      await queryRunner.addColumn(
        CREDENTIAL,
        new TableColumn({
          name: 'validationMessage',
          type: 'varchar',
          length: '2000',
          isNullable: true,
        })
      );
    }
    if (!(await queryRunner.hasColumn(CREDENTIAL, 'validatedAt'))) {
      await queryRunner.addColumn(
        CREDENTIAL,
        new TableColumn({ name: 'validatedAt', type: 'datetime', isNullable: true })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable(CREDENTIAL))) return;
    for (const column of ['validatedAt', 'validationMessage', 'validationState']) {
      if (await queryRunner.hasColumn(CREDENTIAL, column)) {
        await queryRunner.dropColumn(CREDENTIAL, column);
      }
    }
  }
}
