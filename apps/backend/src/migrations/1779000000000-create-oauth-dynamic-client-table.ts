import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

const TABLE_NAME = 'oauth_dynamic_client';

export class CreateOAuthDynamicClientTable1779000000000 implements MigrationInterface {
  public readonly name = 'CreateOAuthDynamicClientTable1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable(TABLE_NAME)) {
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: TABLE_NAME,
        columns: [
          { name: 'clientId', type: 'varchar', length: '100', isPrimary: true },
          { name: 'clientName', type: 'varchar', length: '255', isNullable: true },
          { name: 'userId', type: 'varchar', length: '100', isNullable: true },
          { name: 'status', type: 'varchar', length: '20', isNullable: false },
          { name: 'redirectUris', type: 'json', isNullable: false },
          { name: 'scopes', type: 'json', isNullable: false },
          { name: 'createdAt', type: 'datetime', isNullable: false },
          { name: 'lastUsedAt', type: 'datetime', isNullable: true },
        ],
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
