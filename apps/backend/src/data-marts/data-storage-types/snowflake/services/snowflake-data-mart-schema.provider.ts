import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaProvider } from '../../interfaces/data-mart-schema-provider.interface';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { isConnectorDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { isSnowflakeConfig } from '../../data-storage-config.guards';
import { isSnowflakeCredentials } from '../../data-storage-credentials.guards';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import {
  SnowflakeDataMartSchema,
  SnowflakeDataMartSchemaType,
} from '../schemas/snowflake-data-mart-schema.schema';
import { SnowflakeApiAdapterFactory } from '../adapters/snowflake-api-adapter.factory';
import { SnowflakeApiAdapter } from '../adapters/snowflake-api.adapter';
import { SnowflakeQueryBuilder } from './snowflake-query.builder';
import { SnowflakeFieldType, parseSnowflakeFieldType } from '../enums/snowflake-field-type.enum';

@Injectable()
export class SnowflakeDataMartSchemaProvider implements DataMartSchemaProvider {
  private readonly logger = new Logger(SnowflakeDataMartSchemaProvider.name);
  readonly type = DataStorageType.SNOWFLAKE;

  constructor(
    private readonly adapterFactory: SnowflakeApiAdapterFactory,
    private readonly queryBuilder: SnowflakeQueryBuilder
  ) {}

  async provide(
    definition: DataMartDefinition,
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<SnowflakeDataMartSchema> {
    return this.getActualDataMartSchema(definition, config, credentials);
  }

  async getActualDataMartSchema(
    definition: DataMartDefinition,
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<SnowflakeDataMartSchema> {
    this.logger.debug('Getting schema for data mart', definition);

    if (!isSnowflakeConfig(config)) {
      throw new Error('Incompatible data storage config');
    }

    if (!isSnowflakeCredentials(credentials)) {
      throw new Error('Incompatible data storage credentials');
    }

    const adapter = this.adapterFactory.create(credentials, config);

    try {
      const tableMetadata = await this.getTableMetadataIfExists(definition, adapter);

      if (tableMetadata) {
        this.logger.debug('Retrieved schema from existing table');
        return {
          type: SnowflakeDataMartSchemaType,
          fields: tableMetadata,
        };
      }

      if (isConnectorDefinition(definition)) {
        this.logger.debug('Deriving schema from connector source fields');
        return {
          type: SnowflakeDataMartSchemaType,
          fields: definition.connector.source.fields.map(fieldName => ({
            name: fieldName,
            type: SnowflakeFieldType.STRING,
            isPrimaryKey: false,
            status: DataMartSchemaFieldStatus.CONNECTED,
          })),
        };
      }

      this.logger.debug('Table does not exist yet, deriving schema from query');
      const baseQuery = this.queryBuilder.buildQuery(definition);
      const query = `${baseQuery} LIMIT 0`;

      const { metadata } = await adapter.executeQuery(query, true);

      return {
        type: SnowflakeDataMartSchemaType,
        fields: metadata?.columns?.map(col => this.createFieldFromResult(col.name, col.type)) || [],
      };
    } finally {
      try {
        await adapter.destroy();
        this.logger.debug('Cleaned up Snowflake connection');
      } catch (error) {
        this.logger.error('Failed to clean up Snowflake connection', error);
      }
    }
  }

  private async getTableMetadataIfExists(
    definition: DataMartDefinition,
    adapter: SnowflakeApiAdapter
  ): Promise<SnowflakeDataMartSchema['fields'] | null> {
    if (!isConnectorDefinition(definition)) {
      return null;
    }

    const fullyQualifiedName = definition.connector.storage.fullyQualifiedName;
    const parts = fullyQualifiedName.split('.');

    if (parts.length !== 3) {
      this.logger.warn(`Invalid Snowflake table path: ${fullyQualifiedName}`);
      return null;
    }

    const [rawDatabase, rawSchema, rawTable] = parts;

    const databaseForQuery = this.normalizeIdentifier(rawDatabase);
    const schemaForQuery = this.normalizeIdentifier(rawSchema);
    const tableForQuery = this.normalizeIdentifier(rawTable);

    const primaryKeyColumns = await this.getPrimaryKeyColumns(fullyQualifiedName, adapter);

    const query = `
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COMMENT
      FROM ${databaseForQuery}.INFORMATION_SCHEMA.COLUMNS
      WHERE UPPER(TABLE_CATALOG) = '${databaseForQuery}'
        AND UPPER(TABLE_SCHEMA) = '${schemaForQuery}'
        AND UPPER(TABLE_NAME) = '${tableForQuery}'
      ORDER BY ORDINAL_POSITION
    `;

    try {
      const result = await adapter.executeQuery(query);

      if (!result.rows || result.rows.length === 0) {
        this.logger.debug('Table does not exist in INFORMATION_SCHEMA');
        return null;
      }

      return result.rows.map((row: Record<string, unknown>) => {
        const columnName = (row.COLUMN_NAME || row.column_name) as string;
        const comment = (row.COMMENT || row.comment) as string | undefined;

        return this.createFieldFromResult(
          columnName,
          (row.DATA_TYPE || row.data_type) as string,
          comment,
          primaryKeyColumns.has(columnName)
        );
      });
    } catch (error) {
      this.logger.debug('Failed to query INFORMATION_SCHEMA, table likely does not exist', error);
      return null;
    }
  }

  private normalizeIdentifier(identifier: string): string {
    return identifier.replace(/^"|"$/g, '').toUpperCase();
  }

  private async getPrimaryKeyColumns(
    fullyQualifiedName: string,
    adapter: SnowflakeApiAdapter
  ): Promise<Set<string>> {
    const primaryKeyColumns: Set<string> = new Set();

    try {
      const pkQuery = `SHOW PRIMARY KEYS IN TABLE ${fullyQualifiedName}`;
      const pkResult = await adapter.executeQuery(pkQuery);

      if (pkResult.rows && pkResult.rows.length > 0) {
        pkResult.rows.forEach((row: Record<string, unknown>) => {
          const columnName = (row.column_name || row.COLUMN_NAME) as string;
          if (columnName) {
            primaryKeyColumns.add(columnName);
          }
        });
      }
    } catch (error) {
      this.logger.debug('Failed to query primary keys, table may not have a primary key', error);
    }

    return primaryKeyColumns;
  }

  private createFieldFromResult(
    columnName: string,
    type: string,
    description?: string,
    isPrimaryKey: boolean = false
  ): SnowflakeDataMartSchema['fields'][0] {
    if (!columnName) {
      throw new Error(`Failed to get field name`);
    }

    return {
      name: columnName,
      type: parseSnowflakeFieldType(type) || SnowflakeFieldType.STRING,
      description: description || undefined,
      isPrimaryKey,
      status: DataMartSchemaFieldStatus.CONNECTED,
    };
  }
}
