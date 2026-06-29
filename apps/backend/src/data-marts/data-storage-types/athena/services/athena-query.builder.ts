import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  DataMartQueryBuilder,
  DataMartQueryOptions,
  QueryBuildResult,
} from '../../interfaces/data-mart-query-builder.interface';
import {
  isConnectorDefinition,
  isSqlDefinition,
  isTableDefinition,
  isTablePatternDefinition,
  isViewDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { escapeAthenaIdentifier } from '../utils/athena-identifier.utils';
import { buildDateTruncUnitMap, buildTimeZoneMap } from '../../utils/date-trunc-maps.utils';
import { AthenaClauseRenderer } from './athena-clause-renderer';
import { composeSelectFromClause } from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';

@Injectable()
export class AthenaQueryBuilder implements DataMartQueryBuilder {
  readonly type = DataStorageType.AWS_ATHENA;

  constructor(private readonly clauseRenderer: AthenaClauseRenderer) {}

  buildQuery(
    definition: DataMartDefinition,
    queryOptions?: DataMartQueryOptions
  ): string | QueryBuildResult {
    const aggregations = queryOptions?.aggregations ?? [];
    const dateTruncs = queryOptions?.dateTruncs ?? [];
    const rowCount = queryOptions?.rowCount === true;
    const uniqueCount = queryOptions?.uniqueCount === true;
    const hasOutputControls =
      (queryOptions?.filters?.length ?? 0) > 0 ||
      (queryOptions?.sort?.length ?? 0) > 0 ||
      aggregations.length > 0 ||
      dateTruncs.length > 0 ||
      rowCount ||
      uniqueCount ||
      queryOptions?.limit != null;

    const selectList = this.buildSelectList(queryOptions?.columns);

    if (!hasOutputControls) {
      return this.buildPlainQuery(definition, selectList, queryOptions);
    }

    const fromClause = this.resolveFromClauseWithOutputControls(definition, queryOptions);
    const columnTypes = queryOptions?.columnTypes;
    const resolveColumnType = columnTypes
      ? (rule: FilterRule) => columnTypes.get(rule.column)
      : undefined;
    const where = this.clauseRenderer.renderWhere(
      queryOptions?.filters ?? [],
      undefined,
      'p',
      resolveColumnType
    );
    const orderBy = this.clauseRenderer.renderOrderBy(queryOptions?.sort ?? []);
    const limit = this.clauseRenderer.renderLimit(queryOptions?.limit ?? null);

    if (aggregations.length > 0 || dateTruncs.length > 0 || rowCount || uniqueCount) {
      const agg = this.clauseRenderer.renderAggregatedSelect(
        queryOptions?.columns ?? [],
        aggregations,
        buildDateTruncUnitMap(dateTruncs),
        {
          includeRowCount: rowCount,
          includeUniqueCount: uniqueCount,
          primaryKeyColumns: queryOptions?.primaryKeyColumns,
          timeZoneByColumn: buildTimeZoneMap(dateTruncs),
        }
      );
      // ORDER BY must reference the output alias — a bare aggregated column is not in GROUP BY.
      const aggOrderBy = this.clauseRenderer.renderOrderBy(
        queryOptions?.sort ?? [],
        this.clauseRenderer.buildAggregatedAliasResolver(agg.aliasByColumn)
      );
      const having = this.clauseRenderer.renderHaving(
        queryOptions?.filters ?? [],
        undefined,
        'h',
        resolveColumnType
      );
      return {
        sql: `${composeSelectFromClause(agg.selectSql, fromClause)}${where.sql}${agg.groupBySql}${having.sql}${aggOrderBy.sql}${limit.sql}`,
        params: [...where.params, ...having.params, ...aggOrderBy.params, ...limit.params],
      };
    }

    return {
      sql: `${composeSelectFromClause(selectList, fromClause)}${where.sql}${orderBy.sql}${limit.sql}`,
      params: [...where.params, ...orderBy.params, ...limit.params],
    };
  }

  private buildPlainQuery(
    definition: DataMartDefinition,
    selectList: string,
    queryOptions?: DataMartQueryOptions
  ): string {
    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      return composeSelectFromClause(
        selectList,
        escapeAthenaIdentifier(definition.fullyQualifiedName)
      );
    }
    if (isConnectorDefinition(definition)) {
      return composeSelectFromClause(
        selectList,
        escapeAthenaIdentifier(definition.connector.storage.fullyQualifiedName)
      );
    }
    if (isSqlDefinition(definition)) {
      if (queryOptions?.columns?.length) {
        const cleanQuery = definition.sqlQuery.trim().replace(/;\s*$/, '');
        return composeSelectFromClause(selectList, `(${cleanQuery})`);
      }
      return definition.sqlQuery.trim();
    }
    if (isTablePatternDefinition(definition)) {
      throw new Error('Table pattern queries are not supported in Athena');
    }
    throw new Error('Invalid data mart definition');
  }

  private resolveFromClauseWithOutputControls(
    definition: DataMartDefinition,
    options: DataMartQueryOptions | undefined
  ): string {
    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      return escapeAthenaIdentifier(definition.fullyQualifiedName);
    }
    if (isConnectorDefinition(definition)) {
      return escapeAthenaIdentifier(definition.connector.storage.fullyQualifiedName);
    }
    if (isTablePatternDefinition(definition)) {
      throw new Error('Table pattern queries are not supported in Athena');
    }
    if (isSqlDefinition(definition)) {
      if (options?.mainTableReference) {
        return options.mainTableReference;
      }
      const cleanQuery = definition.sqlQuery.trim().replace(/;\s*$/, '');
      return `(${cleanQuery})`;
    }
    throw new Error('Invalid data mart definition');
  }

  private buildSelectList(columns?: string[]): string {
    if (!columns || columns.length === 0) {
      return '*';
    }
    return columns.map(col => escapeAthenaIdentifier(col)).join(',\n  ');
  }
}
