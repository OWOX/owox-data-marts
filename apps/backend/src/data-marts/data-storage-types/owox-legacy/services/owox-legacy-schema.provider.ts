import { TableSchema } from '@google-cloud/bigquery';
import { Injectable, Logger } from '@nestjs/common';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
    isConnectorDefinition,
    isTableDefinition,
    isViewDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataMartSchema } from '../../data-mart-schema.type';
import { isOwoxLegacyConfig } from '../../data-storage-config.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isOwoxLegacyCredentials } from '../../data-storage-credentials.guards';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaProvider } from '../../interfaces/data-mart-schema-provider.interface';
import { BigQueryApiAdapterFactory } from '../../bigquery/adapters/bigquery-api-adapter.factory';
import { BigQueryFieldMode, parseBigQueryFieldMode } from '../../bigquery/enums/bigquery-field-mode.enum';
import { BigQueryFieldType, parseBigQueryFieldType } from '../../bigquery/enums/bigquery-field-type.enum';
import { BigQueryConfig } from '../../bigquery/schemas/bigquery-config.schema';
import { BigQueryCredentials } from '../../bigquery/schemas/bigquery-credentials.schema';
import {
    BigqueryDataMartSchema,
    BigQueryDataMartSchemaType,
} from '../../bigquery/schemas/bigquery-data-mart.schema';
import { OwoxLegacyQueryBuilder } from './owox-legacy-query.builder';
import { OwoxLegacyConfig } from '../schemas/owox-legacy-config.schema';

/**
 * OWOX Legacy Schema Provider.
 * Uses BigQuery API adapter with converted config to get schema.
 */
@Injectable()
export class OwoxLegacySchemaProvider implements DataMartSchemaProvider {
    private readonly logger = new Logger(OwoxLegacySchemaProvider.name);
    readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

    private static readonly DEFAULT_LOCATION = 'US';

    constructor(
        private readonly adapterFactory: BigQueryApiAdapterFactory,
        private readonly queryBuilder: OwoxLegacyQueryBuilder
    ) { }

    async getActualDataMartSchema(
        dataMartDefinition: DataMartDefinition,
        config: DataStorageConfig,
        credentials: DataStorageCredentials
    ): Promise<DataMartSchema> {
        this.logger.debug('Getting schema for data mart', dataMartDefinition);

        if (!isOwoxLegacyConfig(config)) {
            throw new Error('Incompatible data storage config');
        }

        if (!isOwoxLegacyCredentials(credentials)) {
            throw new Error('Incompatible data storage credentials');
        }

        // Convert to BigQuery config
        const bigQueryConfig: BigQueryConfig = {
            projectId: config.projectId,
            location: OwoxLegacySchemaProvider.DEFAULT_LOCATION,
        };

        const { schema, primaryKeyColumns } = await this.getNativeSchema(
            dataMartDefinition,
            bigQueryConfig,
            credentials as BigQueryCredentials
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
            const tablePath = dataMartDefinition.connector.storage.fullyQualifiedName.split('.');
            [projectId, datasetId, tableId] =
                tablePath.length === 2 ? [config.projectId, ...tablePath] : tablePath;
        }

        const adapter = this.adapterFactory.create(credentials, config);

        if (projectId && datasetId && tableId) {
            const table = adapter.createTableReference(projectId, datasetId, tableId);
            const [tableMetadata] = await table.getMetadata();

            const primaryKeyColumns = tableMetadata.tableConstraints?.primaryKey?.columns;

            return {
                schema: tableMetadata.schema,
                primaryKeyColumns,
            };
        }

        const query = this.queryBuilder.buildQuery(dataMartDefinition);
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
