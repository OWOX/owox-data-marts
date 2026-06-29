import { Injectable } from '@nestjs/common';
import {
  DataMartQueryBuilder,
  DataMartQueryOptions,
} from '../../interfaces/data-mart-query-builder.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  isTableDefinition,
  isViewDefinition,
  isConnectorDefinition,
  isSqlDefinition,
  isTablePatternDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { escapeRedshiftIdentifier } from '../utils/redshift-identifier.utils';
import { buildDateTruncUnitMap, buildTimeZoneMap } from '../../utils/date-trunc-maps.utils';
import { RedshiftClauseRenderer } from './redshift-clause-renderer';
import { composeSelectFromClause } from '../../utils/sql-clause-renderer';

@Injectable()
export class RedshiftQueryBuilder implements DataMartQueryBuilder {
  readonly type = DataStorageType.AWS_REDSHIFT;

  constructor(private readonly clauseRenderer: RedshiftClauseRenderer) {}

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
    const where = this.clauseRenderer.renderWhere(queryOptions?.filters ?? []);
    const orderBy = this.clauseRenderer.renderOrderBy(queryOptions?.sort ?? []);
    const limit = this.clauseRenderer.renderLimit(queryOptions?.limit ?? null);

    // Redshift inlines every literal, so no path carries bound params. Fail fast
    // if a fragment ever produced one (the executor has no channel to bind it).
    const paramCount = where.params.length + orderBy.params.length + limit.params.length;
    if (paramCount > 0) {
      throw new Error(
        `RedshiftQueryBuilder expected zero bound params (literals are inlined) but got ${paramCount}`
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
      // Redshift inlines literals, so HAVING carries no bound params (same as WHERE above).
      const having = this.clauseRenderer.renderHaving(queryOptions?.filters ?? []);
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
        escapeRedshiftIdentifier(definition.fullyQualifiedName)
      );
    }
    if (isConnectorDefinition(definition)) {
      return composeSelectFromClause(
        selectList,
        escapeRedshiftIdentifier(definition.connector.storage.fullyQualifiedName)
      );
    }
    if (isSqlDefinition(definition)) {
      if (queryOptions?.columns?.length) {
        const cleanQuery = definition.sqlQuery.trim().replace(/;\s*$/, '');
        return composeSelectFromClause(selectList, `(${cleanQuery}) AS subq`);
      }
      return definition.sqlQuery.trim();
    }
    if (isTablePatternDefinition(definition)) {
      throw new Error('Table pattern queries are not supported in Redshift');
    }
    throw new Error('Invalid data mart definition');
  }

  private resolveFromClauseWithOutputControls(
    definition: DataMartDefinition,
    options: DataMartQueryOptions | undefined
  ): string {
    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      return escapeRedshiftIdentifier(definition.fullyQualifiedName);
    }
    if (isConnectorDefinition(definition)) {
      return escapeRedshiftIdentifier(definition.connector.storage.fullyQualifiedName);
    }
    if (isTablePatternDefinition(definition)) {
      throw new Error('Table pattern queries are not supported in Redshift');
    }
    if (isSqlDefinition(definition)) {
      if (options?.mainTableReference) {
        return options.mainTableReference;
      }
      const cleanQuery = definition.sqlQuery.trim().replace(/;\s*$/, '');
      return `(${cleanQuery}) AS subq`;
    }
    throw new Error('Invalid data mart definition');
  }

  private buildSelectList(columns?: string[]): string {
    if (!columns || columns.length === 0) {
      return '*';
    }
    return columns.map(col => escapeRedshiftIdentifier(col)).join(',\n  ');
  }
}
