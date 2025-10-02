import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  DataMartQueryBuilder,
  DataMartQueryOptions,
} from '../../interfaces/data-mart-query-builder.interface';
import {
  isConnectorDefinition,
  isSqlDefinition,
  isTableDefinition,
  isTablePatternDefinition,
  isViewDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';

@Injectable()
export class AthenaQueryBuilder implements DataMartQueryBuilder {
  readonly type = DataStorageType.AWS_ATHENA;

  buildQuery(definition: DataMartDefinition, queryOptions?: DataMartQueryOptions): string {
    let query: string;

    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      query = `SELECT * FROM ${this.escapeTablePath(definition.fullyQualifiedName)}`;
    } else if (isConnectorDefinition(definition)) {
      query = `SELECT * FROM ${this.escapeTablePath(definition.connector.storage.fullyQualifiedName)}`;
    } else if (isSqlDefinition(definition)) {
      query = definition.sqlQuery.trim();
    } else if (isTablePatternDefinition(definition)) {
      throw new Error('Table pattern queries are not supported in Athena');
    } else {
      throw new Error('Invalid data mart definition');
    }

    // Apply limit if provided in options
    if (queryOptions?.limit !== undefined) {
      // Remove trailing semicolon if present before wrapping in subquery
      const cleanQuery = query.endsWith(';') ? query.slice(0, -1) : query;
      query = `SELECT * FROM (${cleanQuery}) LIMIT ${queryOptions.limit}`;
    }

    return query;
  }

  private escapeTablePath(tablePath: string): string {
    return tablePath
      .split('.')
      .map(identifier =>
        identifier.startsWith('"') && identifier.endsWith('"') ? identifier : `"${identifier}"`
      )
      .join('.');
  }
}
