import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateLicenseKeyTable1785283200000 implements MigrationInterface {
  name = 'CreateLicenseKeyTable1785283200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'license_key',
        columns: [
          { name: 'licenseKeyId', type: 'varchar', length: '36', isPrimary: true },
          { name: 'projectId', type: 'varchar', length: '255' },
          { name: 'name', type: 'varchar', length: '255' },
          { name: 'origin', type: 'varchar', length: '255' },
          { name: 'expiresAt', type: 'datetime' },
          { name: 'revokedAt', type: 'datetime', isNullable: true },
          { name: 'lastUsedAt', type: 'datetime', isNullable: true },
          { name: 'createdById', type: 'varchar', length: '255', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'license_key',
      new TableIndex({
        name: 'idx_license_key_project_revoked',
        columnNames: ['projectId', 'revokedAt'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'license_key');
  }
}
