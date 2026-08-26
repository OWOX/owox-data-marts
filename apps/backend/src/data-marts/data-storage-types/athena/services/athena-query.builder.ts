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
import { AthenaClauseRenderer } from './athena-clause-renderer';
import {
  assertNoHavingRules,
  buildFilterTypeResolver,
  composePlainSelectBody,
  composeSelectFromClause,
  hasAggregateCalculatedField,
} from '../../utils/sql-clause-renderer';

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
      queryOptions?.limit != null;

    const selectList = this.buildSelectList(queryOptions?.columns);

    if (!hasOutputControls) {
      return this.buildPlainQuery(definition, selectList, queryOptions);
    }

    const fromClause = this.resolveFromClauseWithOutputControls(definition, queryOptions);
    const columnTypes = queryOptions?.columnTypes;
    // The same array the predicate expressions below are built from, so the type a comparison
    // imposes on the VALUE and the one it imposes on the EXPRESSION come from one list of plans.
    const resolveColumnType = buildFilterTypeResolver(
      columnTypes,
      calculatedFilterMetrics,
      this.type
    );
    // A predicate on a Calculated Field compares its FORMULA, at both levels — its
    // name is a SELECT alias with no column behind it. One map for both branches and both clauses.
    const calculatedPredicateExpressions =
      this.clauseRenderer.buildCalculatedPredicateExpressions(calculatedFilterMetrics);
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
        // The plain branch carries no report aggregations by construction: an aggregation is what
        // sends the query down the aggregated branch instead.
        // No opts, matching `buildCalculatedPredicateExpressions` above: this dialect qualifies
        // nothing, so the sort and the filter render the same unqualified expression.
        this.clauseRenderer.buildCalculatedSortExpressions(
          calculatedFields,
          calculatedPredicateExpressions,
          [],
          {}
        )
      )
    );
    const limit = this.clauseRenderer.renderLimit(queryOptions?.limit ?? null);

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
        // Bare column names: the FROM is not aliased. The restriction subquery projects private
        // key aliases, so nothing it exposes can make an outer reference ambiguous.
        qualifyColumn: undefined,
        qualifyProjection: undefined,
        typeByColumn: columnTypes,
        resolveColumnType,
        calculatedFields,
        calculatedPredicateExpressions,
      });
    }

    // Not aggregated, so every remaining calculated field is row-level: a projected expression
    // and nothing else.
    assertNoHavingRules(queryOptions?.filters ?? [], 'AthenaQueryBuilder plain query');
    const plainSelect = composePlainSelectBody(
      selectList,
      this.clauseRenderer.renderCalculatedSelectItems(calculatedFields)
    );
    return {
      sql: `${composeSelectFromClause(plainSelect, fromClause)}${where.sql}${orderBy.sql}${limit.sql}`,
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
