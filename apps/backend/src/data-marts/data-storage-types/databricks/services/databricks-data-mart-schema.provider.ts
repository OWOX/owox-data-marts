import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaProvider } from '../../interfaces/data-mart-schema-provider.interface';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { isConnectorDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { isDatabricksConfig } from '../../data-storage-config.guards';
import { isDatabricksCredentials } from '../../data-storage-credentials.guards';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import {
  DatabricksDataMartSchema,
  DatabricksDataMartSchemaType,
} from '../schemas/databricks-data-mart-schema.schema';
import { DatabricksApiAdapterFactory } from '../adapters/databricks-api-adapter.factory';
import { DatabricksApiAdapter } from '../adapters/databricks-api.adapter';
import { DatabricksQueryBuilder } from './databricks-query.builder';
import { DatabricksFieldType } from '../enums/databricks-field-type.enum';
import { DatabricksConfig } from '../schemas/databricks-config.schema';

@Injectable()
export class DatabricksDataMartSchemaProvider implements DataMartSchemaProvider {
  private readonly logger = new Logger(DatabricksDataMartSchemaProvider.name);
  readonly type = DataStorageType.DATABRICKS;

  constructor(
    private readonly adapterFactory: DatabricksApiAdapterFactory,
    private readonly queryBuilder: DatabricksQueryBuilder
  ) {}

  async provide(
    definition: DataMartDefinition,
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<DatabricksDataMartSchema> {
    return this.getActualDataMartSchema(definition, config, credentials);
  }

  async getActualDataMartSchema(
    definition: DataMartDefinition,
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<DatabricksDataMartSchema> {
    this.logger.debug('Getting schema for data mart', definition);

    if (!isDatabricksConfig(config)) {
      throw new Error('Incompatible data storage config');
    }

    if (!isDatabricksCredentials(credentials)) {
      throw new Error('Incompatible data storage credentials');
    }

    const adapter = this.adapterFactory.create(credentials, config);

    try {
      const tableMetadata = await this.getTableMetadataIfExists(definition, adapter, config);

      if (tableMetadata) {
        this.logger.debug('Retrieved schema from existing table');
        const tableName = isConnectorDefinition(definition)
          ? definition.connector.storage.fullyQualifiedName
          : 'unknown';
        return {
          type: DatabricksDataMartSchemaType,
          table: tableName,
          fields: tableMetadata,
        };
      }

      if (isConnectorDefinition(definition)) {
        this.logger.debug('Deriving schema from connector source fields');
        return {
          type: DatabricksDataMartSchemaType,
          table: definition.connector.storage.fullyQualifiedName,
          fields: definition.connector.source.fields.map(fieldName => ({
            name: fieldName,
            type: DatabricksFieldType.STRING,
            isPrimaryKey: false,
            status: DataMartSchemaFieldStatus.CONNECTED,
          })),
        };
      }

      this.logger.debug('Table does not exist yet, deriving schema from query');
      const baseQuery = this.queryBuilder.buildQuery(definition);
      const query = `${baseQuery} LIMIT 0`;

      const { rows: _rows } = await adapter.executeQuery(query);

      const describeQuery = `DESCRIBE QUERY ${query}`;
      const describeResult = await adapter.executeQuery(describeQuery);

      const tableName = isConnectorDefinition(definition)
        ? definition.connector.storage.fullyQualifiedName
        : 'query_derived';

      return {
        type: DatabricksDataMartSchemaType,
        table: tableName,
        fields: describeResult.rows?.map(col => this.createFieldFromDescribeResult(col)) || [],
      };
    } finally {
      try {
        await adapter.destroy();
        this.logger.debug('Cleaned up Databricks connection');
      } catch (error) {
        this.logger.error('Failed to clean up Databricks connection', error);
      }
    }
  }

  private async getTableMetadataIfExists(
    definition: DataMartDefinition,
    adapter: DatabricksApiAdapter,
    _config: DatabricksConfig
  ): Promise<DatabricksDataMartSchema['fields'] | null> {
    if (!isConnectorDefinition(definition)) {
      return null;
    }

    const fullyQualifiedName = definition.connector.storage.fullyQualifiedName;

    try {
      const describeResult = await adapter.getTableSchema(fullyQualifiedName);

      if (!describeResult || describeResult.length === 0) {
        this.logger.debug('Table does not exist');
        return null;
      }

      const primaryKeyColumns = await adapter.getPrimaryKeyColumns(fullyQualifiedName);
      this.logger.debug(`Primary key columns: ${primaryKeyColumns.join(', ') || 'none'}`);

      return describeResult.map((row: Record<string, unknown>) => {
        const columnName = this.getStringValue(row, 'col_name');
        const dataType = this.getStringValue(row, 'data_type');
        const comment = this.getStringValue(row, 'comment');

        const isPrimaryKey = primaryKeyColumns.includes(columnName);

        return this.createFieldFromResult(columnName, dataType, comment, isPrimaryKey);
      });
    } catch (error) {
      this.logger.debug('Failed to describe table, table likely does not exist', error);
      return null;
    }
  }

  private createFieldFromResult(
    columnName: string,
    type: string,
    description?: string,
    isPrimaryKey: boolean = false
  ): DatabricksDataMartSchema['fields'][0] {
    if (!columnName) {
      throw new Error('Failed to get field name');
    }

    return {
      name: columnName,
      type: this.parseDatabricksFieldType(type),
      description: description || undefined,
      isPrimaryKey,
      status: DataMartSchemaFieldStatus.CONNECTED,
    };
  }

  private createFieldFromDescribeResult(
    row: Record<string, unknown>
  ): DatabricksDataMartSchema['fields'][0] {
    const columnName = this.getStringValue(row, 'col_name');
    const dataType = this.getStringValue(row, 'data_type');

    return this.createFieldFromResult(columnName, dataType);
  }

  private parseDatabricksFieldType(typeString: string): DatabricksFieldType {
    if (!typeString) {
      return DatabricksFieldType.STRING;
    }

    const upperType = typeString.toUpperCase();

    if (upperType in DatabricksFieldType) {
      return DatabricksFieldType[upperType as keyof typeof DatabricksFieldType];
    }

    if (upperType.startsWith('DECIMAL')) return DatabricksFieldType.DECIMAL;
    if (upperType.startsWith('VARCHAR')) return DatabricksFieldType.VARCHAR;
    if (upperType.startsWith('CHAR')) return DatabricksFieldType.CHAR;
    if (upperType.startsWith('ARRAY')) return DatabricksFieldType.ARRAY;
    if (upperType.startsWith('MAP')) return DatabricksFieldType.MAP;
    if (upperType.startsWith('STRUCT')) return DatabricksFieldType.STRUCT;

    this.logger.debug(`Unknown Databricks field type: ${typeString}, defaulting to STRING`);
    return DatabricksFieldType.STRING;
  }

  private getStringValue(record: Record<string, unknown>, fieldName: string): string {
    return (
      ((record[fieldName] ||
        record[fieldName.toLowerCase()] ||
        record[fieldName.toUpperCase()]) as string) || ''
    );
  }
}
