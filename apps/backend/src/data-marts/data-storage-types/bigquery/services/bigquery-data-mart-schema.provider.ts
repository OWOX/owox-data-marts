import { TableSchema } from '@google-cloud/bigquery';
import { Injectable, Logger } from '@nestjs/common';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  isConnectorDefinition,
  isTableDefinition,
  isViewDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataMartSchema } from '../../data-mart-schema.type';
import { isBigQueryConfig } from '../../data-storage-config.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isBigQueryCredentials } from '../../data-storage-credentials.guards';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaProvider } from '../../interfaces/data-mart-schema-provider.interface';
import { BigQueryApiAdapterFactory } from '../adapters/bigquery-api-adapter.factory';
import { BigQueryFieldMode, parseBigQueryFieldMode } from '../enums/bigquery-field-mode.enum';
import { BigQueryFieldType, parseBigQueryFieldType } from '../enums/bigquery-field-type.enum';
import { BigQueryConfig } from '../schemas/bigquery-config.schema';
import { BigQueryCredentials } from '../schemas/bigquery-credentials.schema';
import {
  BigqueryDataMartSchema,
  BigQueryDataMartSchemaType,
} from '../schemas/bigquery-data-mart.schema';
import { BigQueryQueryBuilder } from './bigquery-query.builder';

@Injectable()
export class BigQueryDataMartSchemaProvider implements DataMartSchemaProvider {
  private readonly logger = new Logger(BigQueryDataMartSchemaProvider.name);
  readonly type = DataStorageType.GOOGLE_BIGQUERY;

  constructor(
    private readonly adapterFactory: BigQueryApiAdapterFactory,
    private readonly bigQueryQueryBuilder: BigQueryQueryBuilder
  ) {}

  async getActualDataMartSchema(
    dataMartDefinition: DataMartDefinition,
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<DataMartSchema> {
    this.logger.debug('Getting schema for data mart', dataMartDefinition);

    if (!isBigQueryConfig(config)) {
      throw new Error('Incompatible data storage config');
    }

    if (!isBigQueryCredentials(credentials)) {
      throw new Error('Incompatible data storage credentials');
    }

    const { schema, primaryKeyColumns } = await this.getNativeSchema(
      dataMartDefinition,
      config,
      credentials
    );

    if (!schema || !schema.fields) {
      throw new Error('Failed to get real data mart schema');
    }

    return {
      type: BigQueryDataMartSchemaType,
      fields: this.parseFields(schema.fields, primaryKeyColumns),
    };
  }

  private async getNativeSchema(
    dataMartDefinition: DataMartDefinition,
    config: BigQueryConfig,
    credentials: BigQueryCredentials
  ): Promise<{ schema: TableSchema | undefined; primaryKeyColumns?: string[] }> {
    let projectId, datasetId, tableId;
    if (isTableDefinition(dataMartDefinition) || isViewDefinition(dataMartDefinition)) {
      [projectId, datasetId, tableId] = dataMartDefinition.fullyQualifiedName.split('.');
    } else if (isConnectorDefinition(dataMartDefinition)) {
      [projectId, datasetId, tableId] =
        dataMartDefinition.connector.storage.fullyQualifiedName.split('.');
    }

    const adapter = this.adapterFactory.create(credentials, config);

    if (projectId && datasetId && tableId) {
      const table = adapter.createTableReference(projectId, datasetId, tableId);
      const [tableMetadata] = await table.getMetadata();

      // Extract primary key columns from tableConstraints if available
      const primaryKeyColumns = tableMetadata.tableConstraints?.primaryKey?.columns;

      return {
        schema: tableMetadata.schema,
        primaryKeyColumns,
      };
    }

    const query = this.bigQueryQueryBuilder.buildQuery(dataMartDefinition);
    const dryRunResult = await adapter.executeDryRunQuery(query);
    return { schema: dryRunResult.schema };
  }

  private parseFields(
    fields: TableSchema['fields'],
    primaryKeyColumns?: string[]
  ): BigqueryDataMartSchema['fields'] {
    if (!fields) {
      return [];
    }

    return fields.map(field => {
      let parsedFieldType = parseBigQueryFieldType(field.type || '');
      if (!parsedFieldType) {
        this.logger.error(
          `Failed to parse field type: ${field.type}, defaulting to ${BigQueryFieldType.STRING}`
        );
        parsedFieldType = BigQueryFieldType.STRING;
      }

      let parsedFieldMode = parseBigQueryFieldMode(field.mode || '');
      if (!parsedFieldMode) {
        // if field mode is not defined explicitly
        parsedFieldMode = BigQueryFieldMode.NULLABLE;
      }

      const parsedField = {
        name: field.name!,
        type: parsedFieldType,
        mode: parsedFieldMode,
        description: field.description,
        isPrimaryKey: primaryKeyColumns?.includes(field.name!) || false,
        status: DataMartSchemaFieldStatus.CONNECTED,
      };

      // Handle nested fields for RECORD/STRUCT types
      if (field.fields && field.fields.length > 0) {
        return {
          ...parsedField,
          fields: this.parseFields(field.fields),
        };
      }

      return parsedField;
    });
  }
}
