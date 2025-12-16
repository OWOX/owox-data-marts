import { Injectable, Logger } from '@nestjs/common';
import { DataMartSchemaProvider } from '../../interfaces/data-mart-schema-provider.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataMartSchema } from '../../data-mart-schema.type';
import { RedshiftApiAdapterFactory } from '../adapters/redshift-api-adapter.factory';
import { RedshiftQueryBuilder } from './redshift-query.builder';
import { isRedshiftConfig } from '../../data-storage-config.guards';
import { isRedshiftCredentials } from '../../data-storage-credentials.guards';
import {
  RedshiftDataMartSchemaType,
  RedshiftDataMartSchemaField,
} from '../schemas/redshift-data-mart-schema.schema';
import { parseRedshiftFieldType } from '../enums/redshift-field-type.enum';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';
import { ColumnMetadata } from '@aws-sdk/client-redshift-data';

@Injectable()
export class RedshiftDataMartSchemaProvider implements DataMartSchemaProvider {
  readonly type = DataStorageType.AWS_REDSHIFT;
  private readonly logger = new Logger(RedshiftDataMartSchemaProvider.name);

  constructor(
    private readonly adapterFactory: RedshiftApiAdapterFactory,
    private readonly queryBuilder: RedshiftQueryBuilder
  ) {}

  async getActualDataMartSchema(
    dataMartDefinition: DataMartDefinition,
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<DataMartSchema> {
    if (!isRedshiftConfig(config)) {
      throw new Error('Incompatible data storage config');
    }

    if (!isRedshiftCredentials(credentials)) {
      throw new Error('Incompatible data storage credentials');
    }

    const adapter = this.adapterFactory.create(credentials, config);

    const query = this.queryBuilder.buildQuery(dataMartDefinition, {
      limit: 0,
    });

    const { statementId } = await adapter.executeQuery(query);
    await adapter.waitForQueryToComplete(statementId);

    const metadata = await adapter.getQueryResultsMetadata(statementId);

    return {
      type: RedshiftDataMartSchemaType,
      fields: metadata.map(column => this.createField(column)),
    };
  }

  private createField(column: ColumnMetadata): RedshiftDataMartSchemaField {
    const name = column.label || column.name;
    if (!name) {
      throw new Error('Column name is missing');
    }

    const typeName = column.typeName || 'varchar';
    let type = parseRedshiftFieldType(typeName);
    if (!type) {
      this.logger.warn(`Unknown Redshift type: ${typeName}, defaulting to VARCHAR`);
      type = parseRedshiftFieldType('VARCHAR')!;
    }

    return {
      name,
      type,
      isPrimaryKey: false,
      status: DataMartSchemaFieldStatus.CONNECTED,
    };
  }
}
