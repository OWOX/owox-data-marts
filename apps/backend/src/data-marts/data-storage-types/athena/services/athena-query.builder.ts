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
import { escapeAthenaIdentifier } from '../utils/athena-identifier.utils';

@Injectable()
export class AthenaQueryBuilder implements DataMartQueryBuilder {
  readonly type = DataStorageType.AWS_ATHENA;

  buildQuery(definition: DataMartDefinition, queryOptions?: DataMartQueryOptions): string {
    const selectList = this.buildSelectList(queryOptions?.columns);
    let query: string;

    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      query = `SELECT ${selectList} FROM ${escapeAthenaIdentifier(definition.fullyQualifiedName)}`;
    } else if (isConnectorDefinition(definition)) {
      query = `SELECT ${selectList} FROM ${escapeAthenaIdentifier(definition.connector.storage.fullyQualifiedName)}`;
    } else if (isSqlDefinition(definition)) {
      if (queryOptions?.columns?.length) {
        const cleanQuery = definition.sqlQuery.trim().replace(/;\s*$/, '');
        query = `SELECT ${selectList} FROM (${cleanQuery})`;
      } else {
        query = definition.sqlQuery.trim();
      }
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

  private buildSelectList(columns?: string[]): string {
    if (!columns || columns.length === 0) {
      return '*';
    }
    return columns.map(col => escapeAthenaIdentifier(col)).join(', ');
  }
}
