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
import { FilterRule } from '../../../dto/schemas/filter-config.schema';
import { createIdentifierEscaper } from '../../utils/identifier-escaper.utils';
import { buildDateTruncUnitMap, buildTimeZoneMap } from '../../utils/date-trunc-maps.utils';
import { escapeSnowflakeIdentifier } from '../utils/snowflake-identifier.utils';
import { SnowflakeClauseRenderer } from './snowflake-clause-renderer';
import { composeSelectFromClause } from '../../utils/sql-clause-renderer';

// User-controlled output-control column names use the robust shared escaper (quotes every
// dotted part, doubles inner quotes). Table FQNs in FROM keep escapeSnowflakeIdentifier
// (Snowflake leaves the database part unquoted).
const escapeColumnIdentifier = createIdentifierEscaper({ quoteChar: '"' });

@Injectable()
export class SnowflakeQueryBuilder implements DataMartQueryBuilder {
  readonly type = DataStorageType.SNOWFLAKE;

  constructor(private readonly clauseRenderer: SnowflakeClauseRenderer) {}

  buildQuery(definition: DataMartDefinition, queryOptions?: DataMartQueryOptions): string {
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

    // Snowflake inlines every literal — no path carries bound params. Fail fast if a
    // fragment ever emitted one (the reader rejects parameterized sqlOverride).
    const paramCount = where.params.length + orderBy.params.length + limit.params.length;
    if (paramCount > 0) {
      throw new Error(
        `SnowflakeQueryBuilder expected zero bound params (literals are inlined) but got ${paramCount}`
      );
    }

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
      // Snowflake inlines literals, so HAVING carries no bound params (same as WHERE above).
      const having = this.clauseRenderer.renderHaving(
        queryOptions?.filters ?? [],
        undefined,
        'h',
        resolveColumnType
      );
      return `${composeSelectFromClause(agg.selectSql, fromClause)}${where.sql}${agg.groupBySql}${having.sql}${aggOrderBy.sql}${limit.sql}`;
    }

    return `${composeSelectFromClause(selectList, fromClause)}${where.sql}${orderBy.sql}${limit.sql}`;
  }

  private buildPlainQuery(
    definition: DataMartDefinition,
    selectList: string,
    queryOptions?: DataMartQueryOptions
  ): string {
    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      return composeSelectFromClause(
        selectList,
        escapeSnowflakeIdentifier(definition.fullyQualifiedName)
      );
    }
    if (isConnectorDefinition(definition)) {
      return composeSelectFromClause(
        selectList,
        escapeSnowflakeIdentifier(definition.connector.storage.fullyQualifiedName)
      );
    }
    if (isSqlDefinition(definition)) {
      if (queryOptions?.columns?.length) {
        const cleanQuery = definition.sqlQuery.trim().replace(/;\s*$/, '');
        return composeSelectFromClause(selectList, `(${cleanQuery})`);
      }
      return definition.sqlQuery;
    }
    if (isTablePatternDefinition(definition)) {
      throw new Error('Table pattern definitions are not supported for Snowflake');
    }
    throw new Error('Invalid data mart definition');
  }

  private resolveFromClauseWithOutputControls(
    definition: DataMartDefinition,
    options?: DataMartQueryOptions
  ): string {
    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      return escapeSnowflakeIdentifier(definition.fullyQualifiedName);
    }
    if (isConnectorDefinition(definition)) {
      return escapeSnowflakeIdentifier(definition.connector.storage.fullyQualifiedName);
    }
    if (isSqlDefinition(definition)) {
      // Prefer the pre-materialized view the composer resolves (mirrors Redshift); fall
      // back to wrapping the raw SQL when no reference was supplied.
      if (options?.mainTableReference) {
        return options.mainTableReference;
      }
      const cleanQuery = definition.sqlQuery.trim().replace(/;\s*$/, '');
      return `(${cleanQuery})`;
    }
    if (isTablePatternDefinition(definition)) {
      throw new Error('Table pattern definitions are not supported for Snowflake');
    }
    throw new Error('Invalid data mart definition');
  }

  private buildSelectList(columns?: string[]): string {
    if (!columns || columns.length === 0) {
      return '*';
    }
    return columns.map(col => escapeColumnIdentifier(col)).join(',\n  ');
  }
}
