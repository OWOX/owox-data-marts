import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddDatamartConfigToConnectorSourceCredentials1774500000000 implements MigrationInterface {
  name = 'AddDatamartConfigToConnectorSourceCredentials1774500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add dataMartId column
    await queryRunner.addColumn(
      'connector_source_credentials',
      new TableColumn({
        name: 'dataMartId',
        type: 'varchar',
        isNullable: true,
        default: null,
      })
    );

    // Add configId column
    await queryRunner.addColumn(
      'connector_source_credentials',
      new TableColumn({
        name: 'configId',
        type: 'varchar',
        isNullable: true,
        default: null,
      })
    );

    // Create index on dataMartId for fast lookups
    await queryRunner.createIndex(
      'connector_source_credentials',
      new TableIndex({
        name: 'IDX_connector_source_credentials_dataMartId',
        columnNames: ['dataMartId'],
      })
    );

    // Create composite index on dataMartId + configId for unique lookup
    await queryRunner.createIndex(
      'connector_source_credentials',
      new TableIndex({
        name: 'IDX_connector_source_credentials_dataMart_config',
        columnNames: ['dataMartId', 'configId'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'connector_source_credentials',
      'IDX_connector_source_credentials_dataMart_config'
    );

    await queryRunner.dropIndex(
      'connector_source_credentials',
      'IDX_connector_source_credentials_dataMartId'
    );

    await queryRunner.dropColumn('connector_source_credentials', 'configId');
    await queryRunner.dropColumn('connector_source_credentials', 'dataMartId');
  }
}
