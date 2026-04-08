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
import {
  DataMartQueryBuilder,
  DataMartQueryOptions,
} from '../../interfaces/data-mart-query-builder.interface';
import { escapeFullyQualifiedIdentifier } from '../utils/databricks-identifier.utils';

@Injectable()
export class DatabricksQueryBuilder implements DataMartQueryBuilder {
  readonly type = DataStorageType.DATABRICKS;

  buildQuery(definition: DataMartDefinition, queryOptions?: DataMartQueryOptions): string {
    let query: string;

    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      const parts = definition.fullyQualifiedName.split('.');
      query = `SELECT * FROM ${escapeFullyQualifiedIdentifier(parts)}`;
    } else if (isConnectorDefinition(definition)) {
      const parts = definition.connector.storage.fullyQualifiedName.split('.');
      query = `SELECT * FROM ${escapeFullyQualifiedIdentifier(parts)}`;
    } else if (isSqlDefinition(definition)) {
      query = definition.sqlQuery.trim();
    } else if (isTablePatternDefinition(definition)) {
      throw new Error('Table pattern definitions are not supported for Databricks');
    } else {
      throw new Error('Invalid data mart definition');
    }

    if (queryOptions?.limit !== undefined) {
      const cleanQuery = query.endsWith(';') ? query.slice(0, -1) : query;
      query = `SELECT * FROM (${cleanQuery}) LIMIT ${queryOptions.limit}`;
    }

    return query;
  }
}
