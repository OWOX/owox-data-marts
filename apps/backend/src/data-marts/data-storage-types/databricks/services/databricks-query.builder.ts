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
import { effectiveComparisonType } from '../../field-aggregation';
import {
  escapeDatabricksIdentifier,
  escapeFullyQualifiedIdentifier,
} from '../utils/databricks-identifier.utils';
import { buildDateTruncUnitMap, buildTimeZoneMap } from '../../utils/date-trunc-maps.utils';
import { DatabricksClauseRenderer } from './databricks-clause-renderer';
import { composeSelectFromClause } from '../../utils/sql-clause-renderer';

@Injectable()
export class DatabricksQueryBuilder implements DataMartQueryBuilder {
  readonly type = DataStorageType.DATABRICKS;

  constructor(private readonly clauseRenderer: DatabricksClauseRenderer) {}

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
      ? (rule: FilterRule) => effectiveComparisonType(columnTypes.get(rule.column), rule, this.type)
      : undefined;
    const where = this.clauseRenderer.renderWhere(
      queryOptions?.filters ?? [],
      undefined,
      'p',
      resolveColumnType
    );
    const orderBy = this.clauseRenderer.renderOrderBy(queryOptions?.sort ?? []);
    const limit = this.clauseRenderer.renderLimit(queryOptions?.limit ?? null);

    // Databricks inlines every literal — no path carries bound params. Fail fast if a
    // fragment ever emitted one (the reader rejects parameterized sqlOverride).
    const paramCount = where.params.length + orderBy.params.length + limit.params.length;
    if (paramCount > 0) {
      throw new Error(
        `DatabricksQueryBuilder expected zero bound params (literals are inlined) but got ${paramCount}`
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
          typeByColumn: columnTypes,
        }
      );
      // ORDER BY must reference the output alias — a bare aggregated column is not in GROUP BY.
      const aggOrderBy = this.clauseRenderer.renderOrderBy(
        queryOptions?.sort ?? [],
        this.clauseRenderer.buildAggregatedAliasResolver(agg.aliasByColumn)
      );
      // Databricks inlines literals, so HAVING carries no bound params (same as WHERE above).
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
      const parts = definition.fullyQualifiedName.split('.');
      return composeSelectFromClause(selectList, escapeFullyQualifiedIdentifier(parts));
    }
    if (isConnectorDefinition(definition)) {
      const parts = definition.connector.storage.fullyQualifiedName.split('.');
      return composeSelectFromClause(selectList, escapeFullyQualifiedIdentifier(parts));
    }
    if (isSqlDefinition(definition)) {
      if (queryOptions?.columns?.length) {
        const cleanQuery = definition.sqlQuery.trim().replace(/;\s*$/, '');
        return composeSelectFromClause(selectList, `(${cleanQuery}) AS subq`);
      }
      return definition.sqlQuery.trim();
    }
    if (isTablePatternDefinition(definition)) {
      throw new Error('Table pattern definitions are not supported for Databricks');
    }
    throw new Error('Invalid data mart definition');
  }

  private resolveFromClauseWithOutputControls(
    definition: DataMartDefinition,
    options?: DataMartQueryOptions
  ): string {
    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      return escapeFullyQualifiedIdentifier(definition.fullyQualifiedName.split('.'));
    }
    if (isConnectorDefinition(definition)) {
      return escapeFullyQualifiedIdentifier(
        definition.connector.storage.fullyQualifiedName.split('.')
      );
    }
    if (isSqlDefinition(definition)) {
      // Prefer the pre-materialized view the composer resolves (mirrors Snowflake/Redshift);
      // fall back to wrapping the raw SQL when no reference was supplied (e.g. schema probe).
      if (options?.mainTableReference) {
        return options.mainTableReference;
      }
      const cleanQuery = definition.sqlQuery.trim().replace(/;\s*$/, '');
      // Alias the derived table (mirrors the Redshift sibling). Spark tolerates an
      // unaliased subquery, but `AS subq` keeps the dialect builders uniform.
      return `(${cleanQuery}) AS subq`;
    }
    if (isTablePatternDefinition(definition)) {
      throw new Error('Table pattern definitions are not supported for Databricks');
    }
    throw new Error('Invalid data mart definition');
  }

  private buildSelectList(columns?: string[]): string {
    if (!columns || columns.length === 0) {
      return '*';
    }
    return columns.map(col => escapeDatabricksIdentifier(col)).join(',\n  ');
  }
}
