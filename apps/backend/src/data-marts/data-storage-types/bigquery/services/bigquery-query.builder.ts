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
import { BigQueryClauseRenderer } from './bigquery-clause-renderer';
import {
  assertNoHavingRules,
  buildFilterTypeResolver,
  composePlainSelectBody,
  composeSelectFromClause,
  hasAggregateCalculatedField,
} from '../../utils/sql-clause-renderer';

@Injectable()
export class BigQueryQueryBuilder implements DataMartQueryBuilderAsync {
  readonly type: DataStorageType = DataStorageType.GOOGLE_BIGQUERY;

  /**
   * Correlation name for flat output-controls / explicit-projection queries.
   *
   * BigQuery treats an unaliased table's short name as the row STRUCT alias, so
   * `FROM …country WHERE country = 'x'` compares STRUCT vs STRING. Aliasing the
   * source removes that collision; WHERE/ORDER BY/HAVING are then qualified for
   * an explicit column reference.
   */
  private static readonly FROM_ALIAS = 'src';

  constructor(private readonly clauseRenderer: BigQueryClauseRenderer) {}

  async buildQuery(
    definition: DataMartDefinition,
    queryOptions?: DataMartQueryOptions
  ): Promise<string | QueryBuildResult> {
    const aggregations = queryOptions?.aggregations ?? [];
    const dateTruncs = queryOptions?.dateTruncs ?? [];
    const uniqueCount = queryOptions?.uniqueCount === true;
    const calculatedFields = queryOptions?.calculatedFields ?? [];
    const calculatedFilterMetrics = queryOptions?.calculatedFilterMetrics ?? [];
    const hasExplicitProjection = (queryOptions?.columns?.length ?? 0) > 0;
    const hasOutputControls =
      (queryOptions?.filters?.length ?? 0) > 0 ||
      (queryOptions?.sort?.length ?? 0) > 0 ||
      aggregations.length > 0 ||
      dateTruncs.length > 0 ||
      uniqueCount ||
      calculatedFields.length > 0 ||
      queryOptions?.limit != null;

    const selectList = this.buildSelectList(queryOptions?.columns);

    if (!hasOutputControls && !hasExplicitProjection) {
      // Backward-compatible path.
      if (isSqlDefinition(definition) && !queryOptions?.columns?.length) {
        return definition.sqlQuery;
      }
      return composeSelectFromClause(
        selectList,
        this.resolveFromClauseWithoutOutputControls(definition)
      );
    }

    // Alias the source so the table short name is no longer a row STRUCT range variable.
    const sourceFromClause = hasOutputControls
      ? this.resolveFromClauseWithOutputControls(definition, queryOptions)
      : this.resolveFromClauseWithoutOutputControls(definition);
    const fromClause = `${sourceFromClause} AS ${BigQueryQueryBuilder.FROM_ALIAS}`;
    const qualifyColumn = (column: string) =>
      `${BigQueryQueryBuilder.FROM_ALIAS}.${escapeBigQueryIdentifier(column)}`;
    // Field types let the renderer compare the date part of TIMESTAMP/DATETIME
    // columns against CURRENT_DATE() for relative_date filters (a bare TIMESTAMP =
    // DATE comparison is a type error in BigQuery).
    const columnTypes = queryOptions?.columnTypes;
    // The same array the predicate expressions below are built from, so the type a comparison
    // imposes on the VALUE and the one it imposes on the EXPRESSION come from one list of plans.
    const resolveColumnType = buildFilterTypeResolver(
      columnTypes,
      calculatedFilterMetrics,
      this.type
    );
    // A predicate on a Calculated Field compares its FORMULA, at both levels —
    // its name is a SELECT alias, so `src`.`ctr` names nothing. One map for both branches and both
    // clauses.
    const calculatedPredicateExpressions = this.clauseRenderer.buildCalculatedPredicateExpressions(
      calculatedFilterMetrics,
      { qualifyColumn }
    );
    const where = this.clauseRenderer.renderWhere(
      queryOptions?.filters ?? [],
      qualifyColumn,
      'p',
      resolveColumnType,
      calculatedPredicateExpressions
    );
    // A calculated field's name is a SELECT alias, not a column of `src` — the resolver keeps a
    // sort on one unqualified. Only the plain branch below uses this; the aggregated branch
    // resolves ORDER BY through its own alias map.
    const orderBy = this.clauseRenderer.renderOrderBy(
      queryOptions?.sort ?? [],
      this.clauseRenderer.buildPlainSelectAliasResolver(
        calculatedFields,
        qualifyColumn,
        // The plain branch carries no report aggregations by construction: an aggregation is what
        // sends the query down the aggregated branch instead.
        this.clauseRenderer.buildCalculatedSortExpressions(
          calculatedFields,
          calculatedPredicateExpressions,
          [],
          { qualifyColumn }
        )
      )
    );
    const limit = this.clauseRenderer.renderLimit(queryOptions?.limit ?? null);

    // Aggregations (or a date-trunc bucket / Unique Count) replace the plain
    // SELECT list with `<dims>, FN(<metric>) AS …` and inject GROUP BY.
    // SELECT/GROUP BY stay unqualified: after FROM … AS src, bare column names resolve
    // to columns of src (qualifying projections would force nested-RECORD AS work).
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
        qualifyColumn,
        // SELECT/GROUP BY stay unqualified: after FROM … AS src a bare column name already
        // resolves to a column of src, and qualifying it would force nested-RECORD AS work.
        qualifyProjection: undefined,
        typeByColumn: columnTypes,
        resolveColumnType,
        calculatedFields,
        calculatedPredicateExpressions,
      });
    }

    // Not aggregated, so every remaining calculated field is row-level: a projected expression
    // and nothing else. SELECT/projection stays unqualified, as it is above.
    assertNoHavingRules(queryOptions?.filters ?? [], 'BigQueryQueryBuilder plain query');
    const plainSelect = composePlainSelectBody(
      selectList,
      this.clauseRenderer.renderCalculatedSelectItems(calculatedFields)
    );
    const sql = `${composeSelectFromClause(plainSelect, fromClause)}${where.sql}${orderBy.sql}${limit.sql}`;
    return hasOutputControls
      ? { sql, params: [...where.params, ...orderBy.params, ...limit.params] }
      : sql;
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
