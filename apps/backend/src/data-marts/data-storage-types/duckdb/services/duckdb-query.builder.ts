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
import { escapeDuckDbIdentifier } from '../utils/duckdb-identifier.utils';
import { DuckDbClauseRenderer } from './duckdb-clause-renderer';
import {
  assertNoHavingRules,
  buildFilterTypeResolver,
  composePlainSelectBody,
  composeSelectFromClause,
  hasAggregateCalculatedField,
} from '../../utils/sql-clause-renderer';

@Injectable()
export class DuckDbQueryBuilder implements DataMartQueryBuilder {
  readonly type = DataStorageType.DUCKDB;

  constructor(private readonly clauseRenderer: DuckDbClauseRenderer) {}

  buildQuery(
    definition: DataMartDefinition,
    queryOptions?: DataMartQueryOptions
  ): string | QueryBuildResult {
    const aggregations = queryOptions?.aggregations ?? [];
    const dateTruncs = queryOptions?.dateTruncs ?? [];
    const uniqueCount = queryOptions?.uniqueCount === true;
    const calculatedFields = queryOptions?.calculatedFields ?? [];
    const calculatedFilterMetrics = queryOptions?.calculatedFilterMetrics ?? [];
    const hasOutputControls =
      (queryOptions?.filters?.length ?? 0) > 0 ||
      (queryOptions?.sort?.length ?? 0) > 0 ||
      aggregations.length > 0 ||
      dateTruncs.length > 0 ||
      uniqueCount ||
      calculatedFields.length > 0 ||
      queryOptions?.limit != null ||
      queryOptions?.distinct === true;

    const selectList = this.buildSelectList(queryOptions?.columns);

    if (!hasOutputControls) {
      return this.buildPlainQuery(definition, selectList, queryOptions);
    }

    const fromClause = this.resolveFromClauseWithOutputControls(definition, queryOptions);
    const resolveColumnType = buildFilterTypeResolver(
      queryOptions?.columnTypes,
      calculatedFilterMetrics,
      this.type
    );
    const calculatedPredicateExpressions =
      this.clauseRenderer.buildCalculatedPredicateExpressions(calculatedFilterMetrics);

    if (
      aggregations.length > 0 ||
      dateTruncs.length > 0 ||
      uniqueCount ||
      hasAggregateCalculatedField([...calculatedFields, ...calculatedFilterMetrics])
    ) {
      return this.clauseRenderer.renderAggregatedQuery({
        fromClause,
        columns: queryOptions?.columns ?? [],
        aggregations,
        dateTruncs,
        filters: queryOptions?.filters ?? [],
        sort: queryOptions?.sort ?? [],
        limit: queryOptions?.limit ?? null,
        uniqueCount,
        primaryKeyColumns: queryOptions?.primaryKeyColumns,
        groupRestriction: queryOptions?.groupRestriction,
        qualifyColumn: undefined,
        qualifyProjection: undefined,
        typeByColumn: queryOptions?.columnTypes,
        resolveColumnType,
        calculatedFields,
        calculatedPredicateExpressions,
      });
    }

    assertNoHavingRules(queryOptions?.filters ?? [], 'DuckDbQueryBuilder plain query');
    const where = this.clauseRenderer.renderWhere(
      queryOptions?.filters ?? [],
      undefined,
      'p',
      resolveColumnType,
      calculatedPredicateExpressions
    );
    const orderBy = this.clauseRenderer.renderOrderBy(
      queryOptions?.sort ?? [],
      this.clauseRenderer.buildPlainSelectAliasResolver(
        calculatedFields,
        undefined,
        this.clauseRenderer.buildCalculatedSortExpressions(
          calculatedFields,
          calculatedPredicateExpressions,
          [],
          {}
        )
      )
    );
    const limit = this.clauseRenderer.renderLimit(queryOptions?.limit ?? null);
    const plainSelect = composePlainSelectBody(
      selectList,
      this.clauseRenderer.renderCalculatedSelectItems(calculatedFields)
    );
    return {
      sql: `${composeSelectFromClause(plainSelect, fromClause, { distinct: queryOptions?.distinct })}${where.sql}${orderBy.sql}${limit.sql}`,
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
        escapeDuckDbIdentifier(definition.fullyQualifiedName)
      );
    }
    if (isConnectorDefinition(definition)) {
      return composeSelectFromClause(
        selectList,
        escapeDuckDbIdentifier(definition.connector.storage.fullyQualifiedName)
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
      throw new Error('Table pattern queries are not supported in DuckDB');
    }
    throw new Error('Invalid data mart definition');
  }

  private resolveFromClauseWithOutputControls(
    definition: DataMartDefinition,
    options: DataMartQueryOptions | undefined
  ): string {
    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      return escapeDuckDbIdentifier(definition.fullyQualifiedName);
    }
    if (isConnectorDefinition(definition)) {
      return escapeDuckDbIdentifier(definition.connector.storage.fullyQualifiedName);
    }
    if (isTablePatternDefinition(definition)) {
      throw new Error('Table pattern queries are not supported in DuckDB');
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
    return columns.map(col => escapeDuckDbIdentifier(col)).join(',\n  ');
  }
}
