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
  DataMartQueryBuilderAsync,
  DataMartQueryOptions,
} from '../../interfaces/data-mart-query-builder.interface';
import { escapeBigQueryIdentifier } from '../utils/bigquery-identifier.utils';

@Injectable()
export class BigQueryQueryBuilder implements DataMartQueryBuilderAsync {
  readonly type: DataStorageType = DataStorageType.GOOGLE_BIGQUERY;

  async buildQuery(
    definition: DataMartDefinition,
    queryOptions?: DataMartQueryOptions
  ): Promise<string> {
    const selectList = this.buildSelectList(queryOptions?.columns);

    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      return `SELECT ${selectList} FROM ${escapeBigQueryIdentifier(definition.fullyQualifiedName)}`;
    } else if (isConnectorDefinition(definition)) {
      return `SELECT ${selectList} FROM ${escapeBigQueryIdentifier(definition.connector.storage.fullyQualifiedName)}`;
    } else if (isSqlDefinition(definition)) {
      // Wrap user SQL only when a column filter is provided; otherwise keep
      // the original query untouched so custom logic (CTEs, ORDER BY, etc.)
      // is preserved.
      if (queryOptions?.columns?.length) {
        const cleanQuery = definition.sqlQuery.trim().replace(/;\s*$/, '');
        return `SELECT ${selectList} FROM (${cleanQuery})`;
      }
      return definition.sqlQuery;
    } else if (isTablePatternDefinition(definition)) {
      return `SELECT ${selectList} FROM ${escapeBigQueryIdentifier(definition.pattern + '*')}`;
    } else {
      throw new Error('Invalid data mart definition');
    }
  }

  private buildSelectList(columns?: string[]): string {
    if (!columns || columns.length === 0) {
      return '*';
    }
    return columns.map(col => escapeBigQueryIdentifier(col)).join(', ');
  }
}
