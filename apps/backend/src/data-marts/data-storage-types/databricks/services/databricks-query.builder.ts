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
import { DatabricksClauseRenderer } from './databricks-clause-renderer';
import {
  assertNoHavingRules,
  buildFilterTypeResolver,
  composePlainSelectBody,
  composeSelectFromClause,
  hasAggregateCalculatedField,
} from '../../utils/sql-clause-renderer';

@Injectable()
export class DatabricksQueryBuilder implements DataMartQueryBuilder {
  readonly type = DataStorageType.DATABRICKS;

  constructor(private readonly clauseRenderer: DatabricksClauseRenderer) {}

  buildQuery(definition: DataMartDefinition, queryOptions?: DataMartQueryOptions): string {
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

    this.assertNoParams(where.params.length + orderBy.params.length + limit.params.length);

    if (
      aggregations.length > 0 ||
      dateTruncs.length > 0 ||
      uniqueCount ||
      hasAggregateCalculatedField([...calculatedFields, ...calculatedFilterMetrics])
    ) {
      const built = this.clauseRenderer.renderAggregatedQuery({
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
        resolveColumnType: resolveColumnType,
        calculatedFields,
        calculatedPredicateExpressions,
      });
      this.assertNoParams(built.params.length);
      return built.sql;
    }

    // Not aggregated, so every remaining calculated field is row-level: a projected expression
    // and nothing else.
    assertNoHavingRules(queryOptions?.filters ?? [], 'DatabricksQueryBuilder plain query');
    const plainSelect = composePlainSelectBody(
      selectList,
      this.clauseRenderer.renderCalculatedSelectItems(calculatedFields)
    );
    return `${composeSelectFromClause(plainSelect, fromClause)}${where.sql}${orderBy.sql}${limit.sql}`;
  }

  /**
   * Databricks inlines every literal, so no fragment may carry a bound param — nothing would bind
   * it (the reader rejects parameterized sqlOverride). Checked per fragment group rather than once
   * over a fixed list, so a fragment added later (as the kept-groups restriction was) cannot slip
   * past a check written before it existed.
   */
  private assertNoParams(count: number): void {
    if (count > 0) {
      throw new Error(
        `DatabricksQueryBuilder expected zero bound params (literals are inlined) but got ${count}`
      );
    }
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
