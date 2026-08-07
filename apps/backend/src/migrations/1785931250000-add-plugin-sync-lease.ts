import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

const TABLE = 'plugin';

export class AddPluginSyncLease1785931250000 implements MigrationInterface {
  public readonly name = 'AddPluginSyncLease1785931250000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn(TABLE, 'syncLeaseId'))) {
      await queryRunner.addColumn(
        TABLE,
        new TableColumn({ name: 'syncLeaseId', type: 'varchar', length: '36', isNullable: true })
      );
    }
    if (!(await queryRunner.hasColumn(TABLE, 'syncLeaseStartedAt'))) {
      await queryRunner.addColumn(
        TABLE,
        new TableColumn({ name: 'syncLeaseStartedAt', type: 'datetime', isNullable: true })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn(TABLE, 'syncLeaseStartedAt')) {
      await queryRunner.dropColumn(TABLE, 'syncLeaseStartedAt');
    }
    if (await queryRunner.hasColumn(TABLE, 'syncLeaseId')) {
      await queryRunner.dropColumn(TABLE, 'syncLeaseId');
    }
  }
}
