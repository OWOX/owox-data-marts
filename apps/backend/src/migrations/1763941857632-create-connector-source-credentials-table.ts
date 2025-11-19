import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateConnectorSourceCredentialsTable1763941857632 implements MigrationInterface {
  name = 'CreateConnectorSourceCredentialsTable1763941857632';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'connector_source_credentials',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'projectId', type: 'varchar', isNullable: false },
          { name: 'userId', type: 'varchar', isNullable: true },
          { name: 'connectorName', type: 'varchar', isNullable: false },
          { name: 'credentials', type: 'json', isNullable: false },
          { name: 'user', type: 'json', isNullable: true, default: null },
          { name: 'expiresAt', type: 'datetime', isNullable: true, default: null },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'deletedAt', type: 'datetime', isNullable: true, default: null },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'connector_source_credentials');
  }
}
