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
import {
  escapeDatabricksIdentifier,
  escapeFullyQualifiedIdentifier,
} from '../utils/databricks-identifier.utils';

@Injectable()
export class DatabricksQueryBuilder implements DataMartQueryBuilder {
  readonly type = DataStorageType.DATABRICKS;

  buildQuery(definition: DataMartDefinition, queryOptions?: DataMartQueryOptions): string {
    const selectList = this.buildSelectList(queryOptions?.columns);
    let query: string;

    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      const parts = definition.fullyQualifiedName.split('.');
      query = `SELECT ${selectList} FROM ${escapeFullyQualifiedIdentifier(parts)}`;
    } else if (isConnectorDefinition(definition)) {
      const parts = definition.connector.storage.fullyQualifiedName.split('.');
      query = `SELECT ${selectList} FROM ${escapeFullyQualifiedIdentifier(parts)}`;
    } else if (isSqlDefinition(definition)) {
      if (queryOptions?.columns?.length) {
        const cleanQuery = definition.sqlQuery.trim().replace(/;\s*$/, '');
        query = `SELECT ${selectList} FROM (${cleanQuery})`;
      } else {
        query = definition.sqlQuery.trim();
      }
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

  private buildSelectList(columns?: string[]): string {
    if (!columns || columns.length === 0) {
      return '*';
    }
    return columns.map(col => escapeDatabricksIdentifier(col)).join(', ');
  }
}
