import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
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

    await queryRunner.createIndex(
      'connector_source_credentials',
      new TableIndex({
        name: 'IDX_connector_source_credentials_projectId',
        columnNames: ['projectId'],
      })
    );

    await queryRunner.createIndex(
      'connector_source_credentials',
      new TableIndex({
        name: 'IDX_connector_source_credentials_connectorName',
        columnNames: ['connectorName'],
      })
    );

    await queryRunner.createIndex(
      'connector_source_credentials',
      new TableIndex({
        name: 'IDX_connector_source_credentials_expiresAt',
        columnNames: ['expiresAt'],
      })
    );

    await queryRunner.createIndex(
      'connector_source_credentials',
      new TableIndex({
        name: 'IDX_connector_source_credentials_projectId_connectorName',
        columnNames: ['projectId', 'connectorName'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'connector_source_credentials');
  }
}
