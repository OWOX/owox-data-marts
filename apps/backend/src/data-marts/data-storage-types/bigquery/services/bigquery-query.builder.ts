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
  QueryBuildResult,
} from '../../interfaces/data-mart-query-builder.interface';
import { escapeBigQueryIdentifier } from '../utils/bigquery-identifier.utils';
import { buildDateTruncUnitMap, buildTimeZoneMap } from '../../utils/date-trunc-maps.utils';
import { BigQueryClauseRenderer } from './bigquery-clause-renderer';
import { composeSelectFromClause } from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';

@Injectable()
export class BigQueryQueryBuilder implements DataMartQueryBuilderAsync {
  readonly type: DataStorageType = DataStorageType.GOOGLE_BIGQUERY;

  constructor(private readonly clauseRenderer: BigQueryClauseRenderer) {}

  async buildQuery(
    definition: DataMartDefinition,
    queryOptions?: DataMartQueryOptions
  ): Promise<string | QueryBuildResult> {
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
      // Backward-compatible path.
      if (isSqlDefinition(definition) && !queryOptions?.columns?.length) {
        return definition.sqlQuery;
      }
      return composeSelectFromClause(
        selectList,
        this.resolveFromClauseWithoutOutputControls(definition)
      );
    }

    const fromClause = this.resolveFromClauseWithOutputControls(definition, queryOptions);
    // Field types let the renderer compare the date part of TIMESTAMP/DATETIME
    // columns against CURRENT_DATE() for relative_date filters (a bare TIMESTAMP =
    // DATE comparison is a type error in BigQuery).
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

    // Aggregations (or a date-trunc bucket / Row Count / Unique Count) replace the plain
    // SELECT list with `<dims>, FN(<metric>) AS …` and inject GROUP BY.
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

  private resolveFromClauseWithoutOutputControls(definition: DataMartDefinition): string {
    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      return escapeBigQueryIdentifier(definition.fullyQualifiedName);
    }
    if (isConnectorDefinition(definition)) {
      return escapeBigQueryIdentifier(definition.connector.storage.fullyQualifiedName);
    }
    if (isTablePatternDefinition(definition)) {
      return escapeBigQueryIdentifier(definition.pattern + '*');
    }
    if (isSqlDefinition(definition)) {
      // Reached when columns are provided without output controls — wrap user SQL.
      const cleanQuery = definition.sqlQuery.trim().replace(/;\s*$/, '');
      return `(${cleanQuery})`;
    }
    throw new Error('Invalid data mart definition');
  }

  private resolveFromClauseWithOutputControls(
    definition: DataMartDefinition,
    options: DataMartQueryOptions | undefined
  ): string {
    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      return escapeBigQueryIdentifier(definition.fullyQualifiedName);
    }
    if (isConnectorDefinition(definition)) {
      return escapeBigQueryIdentifier(definition.connector.storage.fullyQualifiedName);
    }
    if (isTablePatternDefinition(definition)) {
      return escapeBigQueryIdentifier(definition.pattern + '*');
    }
    if (isSqlDefinition(definition)) {
      if (!options?.mainTableReference) {
        throw new Error(
          'SQL-defined data marts with output controls require mainTableReference ' +
            '(resolve via DataMartTableReferenceService).'
        );
      }
      return options.mainTableReference;
    }
    throw new Error('Invalid data mart definition');
  }

  private buildSelectList(columns?: string[]): string {
    if (!columns || columns.length === 0) {
      return '*';
    }
    return columns.map(col => escapeBigQueryIdentifier(col)).join(',\n  ');
  }
}
