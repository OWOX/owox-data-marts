import { ColumnInfo } from '@aws-sdk/client-athena';
import { Injectable, Logger } from '@nestjs/common';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartSchema } from '../../data-mart-schema.type';
import { isAthenaConfig } from '../../data-storage-config.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isAthenaCredentials } from '../../data-storage-credentials.guards';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartSchemaProvider } from '../../interfaces/data-mart-schema-provider.interface';
import { AthenaApiAdapterFactory } from '../adapters/athena-api-adapter.factory';
import { S3ApiAdapterFactory } from '../adapters/s3-api-adapter.factory';
import { AthenaFieldType, parseAthenaFieldType } from '../enums/athena-field-type.enum';
import {
  AthenaDataMartSchema,
  AthenaDataMartSchemaType,
} from '../schemas/athena-data-mart-schema.schema';
import { AthenaQueryBuilder } from './athena-query.builder';

@Injectable()
export class AthenaDataMartSchemaProvider implements DataMartSchemaProvider {
  private readonly logger = new Logger(AthenaDataMartSchemaProvider.name);
  readonly type = DataStorageType.AWS_ATHENA;

  constructor(
    private readonly adapterFactory: AthenaApiAdapterFactory,
    private readonly s3AdapterFactory: S3ApiAdapterFactory,
    private readonly athenaQueryBuilder: AthenaQueryBuilder
  ) {}

  /**
   * Retrieves the actual schema of a data mart from AWS Athena by executing a query with LIMIT 0.
   * Cleans up temporary S3 output files after fetching the schema.
   *
   * @param dataMartDefinition - Definition of the data mart table
   * @param config - Data storage configuration for Athena
   * @param credentials - Credentials for Athena access
   * @returns DataMartSchema containing field definitions
   * @throws Error if the config or credentials are incompatible, or schema retrieval fails
   */
  async getActualDataMartSchema(
    dataMartDefinition: DataMartDefinition,
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<DataMartSchema> {
    this.logger.debug('Getting schema for data mart', dataMartDefinition);

    if (!isAthenaConfig(config)) {
      throw new Error('Incompatible data storage config');
    }

    if (!isAthenaCredentials(credentials)) {
      throw new Error('Incompatible data storage credentials');
    }

    // Build the query with LIMIT 0 to get schema without retrieving data
    const query = this.athenaQueryBuilder.buildQuery(dataMartDefinition, { limit: 0 });
    const adapter = this.adapterFactory.create(credentials, config);
    const s3Adapter = this.s3AdapterFactory.create(credentials, config);
    const outputPrefix = this.getOutputPrefix();

    try {
      const { queryExecutionId } = await adapter.executeQuery(
        query,
        config.outputBucket,
        outputPrefix
      );
      await adapter.waitForQueryToComplete(queryExecutionId);
      const metadata = await adapter.getQueryResultsMetadata(queryExecutionId);

      if (!metadata || !metadata.ColumnInfo) {
        throw new Error('Failed to get real data mart schema');
      }

      return {
        type: AthenaDataMartSchemaType,
        fields: metadata.ColumnInfo.map(column => {
          return this.createField(column);
        }),
      };
    } finally {
      // Clean up S3 output files
      try {
        await s3Adapter.cleanupOutputFiles(config.outputBucket, outputPrefix);
        this.logger.debug('Cleaned up S3 output files');
      } catch (error) {
        this.logger.error('Failed to clean up S3 output files', error);
      }
    }
  }

  /**
   * Creates a field definition for Athena data mart schema from Athena column metadata.
   *
   * @param column - Athena column metadata
   * @returns AthenaDataMartSchema field object
   * @throws Error if the column name is missing
   */
  private createField(column: ColumnInfo): AthenaDataMartSchema['fields'][0] {
    const name = column.Label || column.Name;
    if (!name) {
      throw new Error(`Failed to get field name for column ${column}`);
    }

    let type = parseAthenaFieldType(column.Type || '');
    if (!type) {
      this.logger.error(
        `Failed to parse field type for ${column.Type}, defaulting to ${AthenaFieldType.STRING}`
      );
      type = AthenaFieldType.STRING;
    }

    return {
      name,
      type,
      isPrimaryKey: false,
      status: DataMartSchemaFieldStatus.CONNECTED,
    };
  }

  /**
   * Generates a unique S3 output prefix for Athena schema fetch operation.
   *
   * @returns A unique S3 prefix string
   */
  private getOutputPrefix(): string {
    return `athena-schema-fetch/${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
}
