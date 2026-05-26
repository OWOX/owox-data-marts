import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

const TABLE_NAME = 'project_member_api_key';

export class CreateProjectMemberApiKeyTable1777000000000 implements MigrationInterface {
  public readonly name = 'CreateProjectMemberApiKeyTable1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable(TABLE_NAME)) {
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: TABLE_NAME,
        columns: [
          { name: 'apiKeyId', type: 'varchar', length: '26', isPrimary: true },
          { name: 'projectId', type: 'varchar', length: '255', isNullable: false },
          { name: 'userId', type: 'varchar', length: '255', isNullable: false },
          { name: 'name', type: 'varchar', length: '255', isNullable: false },
          { name: 'role', type: 'varchar', length: '20', isNullable: false },
          { name: 'readOnly', type: 'boolean', isNullable: false, default: false },
          { name: 'expiresAt', type: 'datetime', isNullable: true, default: null },
          { name: 'revokedAt', type: 'datetime', isNullable: true, default: null },
          { name: 'lastAuthenticatedAt', type: 'datetime', isNullable: true, default: null },
          { name: 'keyHash', type: 'varchar', length: '255', isNullable: false },
          { name: 'keyHashSalt', type: 'varchar', length: '64', isNullable: false },
          { name: 'keyHashParams', type: 'json', isNullable: false },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      })
    );

    await queryRunner.createIndex(
      TABLE_NAME,
      new TableIndex({
        name: 'idx_project_member_api_key_apiKeyId',
        columnNames: ['apiKeyId'],
      })
    );
    await queryRunner.createIndex(
      TABLE_NAME,
      new TableIndex({
        name: 'idx_project_member_api_key_project_user_revoked',
        columnNames: ['projectId', 'userId', 'revokedAt'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable(TABLE_NAME))) {
      return;
    }

    await softDropTable(queryRunner, TABLE_NAME);
  }
}
