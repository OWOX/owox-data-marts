import { Injectable } from '@nestjs/common';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  isConnectorDefinition,
  isSqlDefinition,
  isTableDefinition,
  isTablePatternDefinition,
  isViewDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartQueryBuilder } from '../../interfaces/data-mart-query-builder.interface';
import { escapeSnowflakeIdentifier } from '../utils/snowflake-identifier.utils';

@Injectable()
export class SnowflakeQueryBuilder implements DataMartQueryBuilder {
  readonly type = DataStorageType.SNOWFLAKE;

  buildQuery(definition: DataMartDefinition): string {
    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      return `SELECT * FROM ${escapeSnowflakeIdentifier(definition.fullyQualifiedName)}`;
    } else if (isConnectorDefinition(definition)) {
      return `SELECT * FROM ${escapeSnowflakeIdentifier(definition.connector.storage.fullyQualifiedName)}`;
    } else if (isSqlDefinition(definition)) {
      return definition.sqlQuery;
    } else if (isTablePatternDefinition(definition)) {
      // Snowflake doesn't support table patterns like BigQuery
      // This would need to be implemented differently, possibly using INFORMATION_SCHEMA
      throw new Error('Table pattern definitions are not supported for Snowflake');
    } else {
      throw new Error('Invalid data mart definition');
    }
  }
}
