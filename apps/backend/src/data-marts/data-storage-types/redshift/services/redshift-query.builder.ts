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

    this.assertNoParams(where.params.length + orderBy.params.length + limit.params.length);

    if (aggregations.length > 0 || dateTruncs.length > 0 || rowCount || uniqueCount) {
      const built = this.clauseRenderer.renderAggregatedQuery({
        fromClause,
        columns: queryOptions?.columns ?? [],
        aggregations,
        dateTruncs,
        filters: queryOptions?.filters ?? [],
        sort: queryOptions?.sort ?? [],
        limit: queryOptions?.limit ?? null,
        rowCount,
        uniqueCount,
        primaryKeyColumns: queryOptions?.primaryKeyColumns,
        groupRestriction: queryOptions?.groupRestriction,
        // Bare column names: the FROM is not aliased. The restriction subquery projects private
        // key aliases, so nothing it exposes can make an outer reference ambiguous.
        qualifyColumn: undefined,
        qualifyProjection: undefined,
        typeByColumn: queryOptions?.columnTypes,
        resolveColumnType: undefined,
      });
      this.assertNoParams(built.params.length);
      return built.sql;
    }

    return `${composeSelectFromClause(selectList, fromClause)}${where.sql}${orderBy.sql}${limit.sql}`;
  }

  /**
   * Redshift inlines every literal, so no fragment may carry a bound param — the executor has no
   * channel to bind one. Checked per fragment group rather than once over a fixed list, so a
   * fragment added later (as the kept-groups restriction was) cannot slip past a check written
   * before it existed.
   */
  private assertNoParams(count: number): void {
    if (count > 0) {
      throw new Error(
        `RedshiftQueryBuilder expected zero bound params (literals are inlined) but got ${count}`
      );
    }
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
