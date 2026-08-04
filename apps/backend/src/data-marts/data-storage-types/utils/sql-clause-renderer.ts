import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { SortRule } from '../../dto/schemas/sort-config.schema';
import { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import { ReportAggregateFunction } from '../../dto/schemas/aggregate-function.schema';
import {
  DateTruncRule,
  DateTruncUnit,
  DATE_TRUNC_UNITS,
  IANA_TIME_ZONE_PATTERN,
} from '../../dto/schemas/date-trunc-config.schema';
import {
  ROW_COUNT_LABEL,
  UNIQUE_COUNT_LABEL,
  aggregatedColumnLabel,
  aggregationFunctionsForColumn,
} from '../../dto/schemas/aggregation-labels';
import { isFloatingPointType } from '../../dto/schemas/field-type-category';
import { GroupRestriction } from '../../dto/domain/group-restriction';
import { buildDateTruncUnitMap, buildTimeZoneMap } from './date-trunc-maps.utils';
import {
  KEPT_GROUPS_CTE,
  buildKeptGroupsJoinPairs,
  buildKeptGroupsProjection,
} from './kept-groups.utils';

// Array order MUST match placeholder order in the SQL: positional dialects
// (Athena `?`) bind by position and ignore `name`.
export interface SqlParameter {
  name: string;
  value: string | number | boolean | null;
}

export interface RenderedClause {
  sql: string;
  params: SqlParameter[];
}

/**
 * Returns the SQL fragment for a column reference — fully quoted and, when
 * needed, prefixed with a CTE alias. The renderer cannot derive the prefix
 * from the column name alone, so the caller supplies one.
 */
export type ColumnRefResolver = (column: string) => string;

/**
 * Resolves the storage field type for a filter rule's column. Positional dialects
 * (Athena) use it to cast date/time placeholders so a varchar literal is not
 * compared against a DATE/TIMESTAMP column. Returns undefined when unknown — the
 * renderer then emits a plain placeholder.
 */
export type ColumnTypeResolver = (rule: FilterRule) => string | undefined;

// Matches BigQuery named-parameter rules — fail fast instead of waiting for BQ to reject it.
const PARAM_PREFIX_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Assembles a `SELECT … FROM …` head with the column list one-per-line at 2-space
 * indent — the same shape the blended builder and CTE blocks already use, so every
 * dialect's flat query formats identically. `selectBody` is either `*` (kept inline)
 * or a column list already joined with `,\n  ` (e.g. from `renderAggregatedSelect`
 * or a dialect's `,\n  `-joined projection).
 */
export function composeSelectFromClause(selectBody: string, fromClause: string): string {
  return selectBody === '*'
    ? `SELECT *\nFROM ${fromClause}`
    : `SELECT\n  ${selectBody}\nFROM ${fromClause}`;
}

export abstract class SqlClauseRenderer {
  protected abstract quoteIdentifier(name: string): string;
  protected abstract renderFilterFragment(
    rule: FilterRule,
    paramName: string,
    columnRef: string,
    columnType?: string
  ): RenderedClause;

  private resolverOrFallback(qualifyColumn: ColumnRefResolver | undefined): ColumnRefResolver {
    return qualifyColumn ?? (c => this.quoteIdentifier(c));
  }

  renderWhere(
    filters: FilterRule[],
    qualifyColumn?: ColumnRefResolver,
    paramPrefix = 'p',
    resolveColumnType?: ColumnTypeResolver
  ): RenderedClause {
    // Rules carrying a `function` are post-aggregation (HAVING) — handled by
    // renderHaving — so WHERE skips them. Callers pass the full filter list to both.
    const whereRules = filters.filter(rule => !rule.function);
    if (!whereRules.length) return { sql: '', params: [] };
    if (!PARAM_PREFIX_PATTERN.test(paramPrefix)) {
      throw new Error(
        `renderWhere: invalid paramPrefix '${paramPrefix}' — must match ${PARAM_PREFIX_PATTERN.source}`
      );
    }
    const resolve = this.resolverOrFallback(qualifyColumn);
    const fragments: string[] = [];
    const params: SqlParameter[] = [];
    let nextIndex = 0;
    for (const rule of whereRules) {
      const paramName = `${paramPrefix}${nextIndex}`;
      const out = this.renderFilterFragment(
        rule,
        paramName,
        resolve(rule.column),
        resolveColumnType?.(rule)
      );
      this.validateFragment(out);
      fragments.push(out.sql);
      params.push(...out.params);
      nextIndex += out.params.length;
    }
    return { sql: `\nWHERE ${fragments.join('\n  AND ')}`, params };
  }

  /**
   * Renders the HAVING clause for post-aggregation filters. Each rule carries the
   * `function` that names the aggregate to compare, so the left-hand side is the SAME
   * aggregate EXPRESSION the SELECT emits (e.g. `SUM(\`amount\`) > @h0`) — NOT the output
   * alias, which several dialects forbid in HAVING. The comparison/operator/param logic
   * is shared with WHERE via `renderFilterFragment`. `qualifyColumn` MUST match the one
   * passed to `renderAggregatedSelect` so the aggregate argument is qualified identically
   * (otherwise `SUM(main.col)` in SELECT vs `SUM(col)` in HAVING is a different expression).
   */
  renderHaving(
    filters: FilterRule[],
    qualifyColumn?: ColumnRefResolver,
    paramPrefix = 'h',
    resolveColumnType?: ColumnTypeResolver
  ): RenderedClause {
    // Only rules carrying a `function` are HAVING; the rest are WHERE (renderWhere).
    const havingRules = filters.filter(rule => rule.function);
    if (!havingRules.length) return { sql: '', params: [] };
    if (!PARAM_PREFIX_PATTERN.test(paramPrefix)) {
      throw new Error(
        `renderHaving: invalid paramPrefix '${paramPrefix}' — must match ${PARAM_PREFIX_PATTERN.source}`
      );
    }
    const resolve = this.resolverOrFallback(qualifyColumn);
    const fragments: string[] = [];
    const params: SqlParameter[] = [];
    let nextIndex = 0;
    for (const rule of havingRules) {
      const fn = rule.function;
      if (!fn) continue;
      const paramName = `${paramPrefix}${nextIndex}`;
      const aggregateRef = this.renderAggregateExpression(fn, resolve(rule.column));
      const out = this.renderFilterFragment(
        rule,
        paramName,
        aggregateRef,
        resolveColumnType?.(rule)
      );
      this.validateFragment(out);
      fragments.push(out.sql);
      params.push(...out.params);
      nextIndex += out.params.length;
    }
    return { sql: `\nHAVING ${fragments.join('\n  AND ')}`, params };
  }

  /**
   * Renders the SELECT list and GROUP BY for an aggregated query. Group-by is
   * implied: any projected `column` without an aggregation rule becomes a grouping
   * key, in projection order. A column may carry MORE THAN ONE aggregation function —
   * each emits its own `FN(col) AS "<col> | TOKEN"` select item, in rule
   * order — the FN argument stays the raw column, only the output alias carries the
   * suffix. A dimension that carries a date-trunc unit renders as
   * `DATE_TRUNC(col) AS "col"` and groups by that same truncated expression (not the
   * bare column). Returns empty `groupBySql` when every projected column is aggregated.
   * When `opts.includeRowCount` is set, a `COUNT(*) AS "Row Count"` metric is appended
   * as the last select item (no extra GROUP BY key).
   *
   * `aliasByColumn` maps each projected column to its QUOTED output alias (metric →
   * its FIRST function's quoted suffixed label, dimension incl. date-trunc → quoted
   * column). Feed it to `buildAggregatedAliasResolver` so ORDER BY references the output
   * alias — a bare aggregated column is not in GROUP BY and would be a SQL error. An
   * ORDER BY on a multi-aggregated column therefore resolves to its first aggregation.
   *
   * `opts.qualifyColumn` lets the blended builder qualify the FN argument / dimension
   * expression / GROUP BY key with a CTE alias (e.g. `main.\`col\``). When set, a plain
   * dimension renders with an explicit `AS <unqualified alias>` so the output column
   * name equals the header name; when absent (the flat path) it renders as just the
   * quoted column with no alias. The output alias is always unqualified in both modes.
   */
  /**
   * The SQL type keyword used in CAST(<col> AS <type>) inside the UNIQUE COUNT
   * composite-PK CONCAT expression. BigQuery and Databricks use STRING; Snowflake,
   * Redshift, and Athena override this to VARCHAR.
   */
  protected textCastType(): string {
    return 'STRING';
  }

  /**
   * Renders `COUNT(DISTINCT <pk-tuple>)` for the Unique Count metric.
   * - Single PK column: `COUNT(DISTINCT <ref>)` — no CONCAT needed.
   * - Composite PK: CONCAT of COALESCE(CAST(<ref> AS <type>), '') parts joined by
   *   the raw U+241F unit-separator character. The char is embedded literally inside
   *   the single-quoted SQL literal so every dialect sees the SAME byte — a SQL
   *   backslash-escape (`'\\u241F'`) would mean U+241F on BigQuery/Databricks but six
   *   literal characters on Redshift/Snowflake/Athena, collidably per engine.
   */
  protected renderCountDistinctPrimaryKey(
    pkColumns: string[],
    qualify?: ColumnRefResolver
  ): string {
    const ref = (col: string): string => (qualify ? qualify(col) : this.quoteIdentifier(col));
    if (pkColumns.length === 1) {
      return `COUNT(DISTINCT ${ref(pkColumns[0])})`;
    }
    // Multi-column PK: concatenate with a unit-separator so distinct tuples stay distinct.
    const SEP = "'␟'";
    const castType = this.textCastType();
    const parts = pkColumns.map(col => `COALESCE(CAST(${ref(col)} AS ${castType}), '')`);
    const concatArgs = parts.join(`, ${SEP}, `);
    return `COUNT(DISTINCT CONCAT(${concatArgs}))`;
  }

  renderAggregatedSelect(
    columns: string[],
    aggregations: AggregationRule[],
    dateTruncByColumn?: ReadonlyMap<string, DateTruncUnit>,
    opts?: {
      includeRowCount?: boolean;
      includeUniqueCount?: boolean;
      primaryKeyColumns?: string[];
      qualifyColumn?: ColumnRefResolver;
      // column → validated IANA time zone for date-trunc rules that carry one.
      timeZoneByColumn?: ReadonlyMap<string, string>;
      // column → storage field type, so a dialect can render date-trunc type-aware
      // (e.g. BigQuery must treat a tz-naive DATETIME differently from a TIMESTAMP).
      typeByColumn?: ReadonlyMap<string, string>;
    }
  ): {
    selectSql: string;
    groupBySql: string;
    aliasByColumn: ReadonlyMap<string, string>;
    // The individual GROUP BY key expressions, exactly as emitted. Returned so a caller can
    // ASSERT that an expression it built elsewhere (a metric sleeve's projected dimension,
    // ) is byte-identical to the outer grouping key it must join back on, instead of
    // trusting that both derivations stay in step.
    groupByParts: readonly string[];
  } {
    const qualify = opts?.qualifyColumn;
    const timeZoneByColumn = opts?.timeZoneByColumn;
    const typeByColumn = opts?.typeByColumn;
    const aliasByColumn = new Map<string, string>();
    const groupByParts: string[] = [];
    const selectParts = columns.flatMap(c => {
      const ref = qualify ? qualify(c) : this.quoteIdentifier(c);
      const fns = aggregationFunctionsForColumn(aggregations, c);
      if (fns.length > 0) {
        // One SELECT item per function, in rule order. The column is an aggregated
        // metric — never a GROUP BY key. aliasByColumn points at the FIRST function's
        // alias so ORDER BY on the column resolves to its first aggregation.
        const items = fns.map(fn => {
          const alias = this.quoteIdentifier(aggregatedColumnLabel(c, fn));
          if (!aliasByColumn.has(c)) aliasByColumn.set(c, alias);
          return `${this.renderAggregateExpression(fn, ref)} AS ${alias}`;
        });
        return items;
      }
      const outputAlias = this.quoteIdentifier(c);
      const unit = dateTruncByColumn?.get(c);
      if (unit) {
        const truncated = this.renderDateTrunc(
          ref,
          unit,
          timeZoneByColumn?.get(c),
          typeByColumn?.get(c)
        );
        groupByParts.push(truncated);
        aliasByColumn.set(c, outputAlias);
        return [`${truncated} AS ${outputAlias}`];
      }
      groupByParts.push(ref);
      aliasByColumn.set(c, outputAlias);
      // Flat path renders a bare reference (no AS); qualified mode must alias the
      // qualified reference back to the unqualified output column name.
      return [qualify ? `${ref} AS ${outputAlias}` : ref];
    });
    if (opts?.includeRowCount) {
      selectParts.push(`COUNT(*) AS ${this.quoteIdentifier(ROW_COUNT_LABEL)}`);
    }
    if (opts?.includeUniqueCount && opts?.primaryKeyColumns?.length) {
      selectParts.push(
        `${this.renderCountDistinctPrimaryKey(opts.primaryKeyColumns, qualify)} AS ${this.quoteIdentifier(UNIQUE_COUNT_LABEL)}`
      );
    }
    const groupBySql = groupByParts.length ? `\nGROUP BY\n  ${groupByParts.join(',\n  ')}` : '';
    return { selectSql: selectParts.join(',\n  '), groupBySql, aliasByColumn, groupByParts };
  }

  /**
   * Resolver for ORDER BY in an aggregated query: maps a column to its quoted output
   * alias (from `renderAggregatedSelect().aliasByColumn`), falling back to plain
   * quoting for any column not in the map.
   */
  buildAggregatedAliasResolver(aliasByColumn: ReadonlyMap<string, string>): ColumnRefResolver {
    return col => aliasByColumn.get(col) ?? this.quoteIdentifier(col);
  }

  /**
   * Truncates a date/timestamp column reference to a calendar bucket. When `timeZone`
   * is set, the value is converted to that zone BEFORE truncation; when absent, the
   * emitted SQL is unchanged from the no-tz form. The `timeZone` is a validated IANA
   * name inlined as a string literal (see IANA_TIME_ZONE_PATTERN — the injection guard).
   * Every dialect MUST override this — the base implementation only guards against a
   * missing override.
   */
  protected renderDateTrunc(
    _columnRef: string,
    _unit: DateTruncUnit,
    _timeZone?: string,
    _columnType?: string
  ): string {
    throw new Error('renderDateTrunc not implemented for this dialect');
  }

  /**
   * Public entry point for `renderDateTrunc`. A metric-sleeve CTE (built outside this
   * class hierarchy, in the blended-query builder) must reproduce the IDENTICAL
   * truncated expression the outer GROUP BY uses for the same dimension, so it needs
   * a callable path to the dialect's date-trunc rendering without duplicating it.
   */
  renderDateTruncExpression(
    columnRef: string,
    unit: DateTruncUnit,
    timeZone?: string,
    columnType?: string
  ): string {
    return this.renderDateTrunc(columnRef, unit, timeZone, columnType);
  }

  // Terminal injection gate: `unit`/`timeZone` are INLINED (not bound). Each dialect
  // override MUST call this first — a guard on the base renderDateTrunc alone never runs.
  protected assertSafeDateTrunc(unit: DateTruncUnit, timeZone?: string): void {
    if (!DATE_TRUNC_UNITS.includes(unit)) {
      throw new Error(`Unsupported date-trunc unit: ${String(unit)}`);
    }
    if (timeZone !== undefined && !IANA_TIME_ZONE_PATTERN.test(timeZone)) {
      throw new Error(`Invalid IANA time zone: ${String(timeZone)}`);
    }
  }

  // The one aggregation whose ANSWER differs per warehouse, not just its spelling: BigQuery and
  // Athena approximate and return a value from the data, PERCENTILE_CONT interpolates. On
  // [1,2,3,4] the median is 2 or 3 there and 2.5 here.
  protected renderPercentile(_p: 25 | 50 | 75 | 95, _columnRef: string): string {
    throw new Error(`Percentile aggregation not supported for this storage`);
  }

  protected renderStringAgg(_columnRef: string): string {
    throw new Error(`STRING_AGG not supported for this storage`);
  }

  protected renderAnyValue(columnRef: string): string {
    return `ANY_VALUE(${columnRef})`;
  }

  // Public because a metric sleeve computes its metric in its own CTE and needs this spelling —
  // two independent spellings of one function is the drift this class exists to prevent.
  renderAggregateExpression(fn: ReportAggregateFunction, columnRef: string): string {
    switch (fn) {
      case 'COUNT_DISTINCT':
        return `COUNT(DISTINCT ${columnRef})`;
      case 'STRING_AGG':
        return this.renderStringAgg(columnRef);
      case 'P25':
        return this.renderPercentile(25, columnRef);
      case 'P50':
        return this.renderPercentile(50, columnRef);
      case 'P75':
        return this.renderPercentile(75, columnRef);
      case 'P95':
        return this.renderPercentile(95, columnRef);
      case 'ANY_VALUE':
        return this.renderAnyValue(columnRef);
      case 'SUM':
      case 'MIN':
      case 'MAX':
      case 'AVG':
      case 'COUNT':
        return `${fn}(${columnRef})`;
      default: {
        const _exhaustive: never = fn;
        return _exhaustive;
      }
    }
  }

  renderOrderBy(sort: SortRule[], qualifyColumn?: ColumnRefResolver): RenderedClause {
    if (!sort.length) return { sql: '', params: [] };
    const resolve = this.resolverOrFallback(qualifyColumn);
    const parts = sort.map(r => `${resolve(r.column)} ${r.direction.toUpperCase()}`);
    return { sql: `\nORDER BY\n  ${parts.join(',\n  ')}`, params: [] };
  }

  renderLimit(limit: number | null | undefined): RenderedClause {
    if (limit == null) return { sql: '', params: [] };
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error(`Invalid LIMIT value: ${String(limit)}`);
    }
    return { sql: `\nLIMIT ${limit}`, params: [] };
  }

  /**
   * The WHOLE aggregated query for a flat (non-blended) data mart: projection, grouping, the
   * Totals group restriction, WHERE/HAVING, ORDER BY and LIMIT — assembled in one place.
   *
   * It exists because assembling it per dialect meant five copies of the same eight-step
   * sequence, and they had already drifted: the kept-groups restriction reached one builder with
   * a column qualifier and three without, Redshift passed it neither field types nor a type
   * resolver, and nothing in the type system objected. A sixth storage (Postgres-compatible
   * destinations are on the roadmap) would have compiled cleanly and been wrong in the same way —
   * or, worse, omitted the restriction entirely and silently computed Totals over hidden groups.
   *
   * What genuinely differs per dialect is expressed as parameters: how the source is written
   * (`fromClause`), whether columns are qualified (`qualifyColumn` — only BigQuery aliases its
   * source), and the type maps. Everything else, including the ORDER of the bound params, is
   * fixed here: positional dialects bind by position, so the array must follow the placeholders
   * in text order — kept-groups first, since its join precedes the outer WHERE.
   */
  renderAggregatedQuery(opts: {
    fromClause: string;
    columns: string[];
    aggregations: AggregationRule[];
    dateTruncs: DateTruncRule[];
    filters: FilterRule[];
    sort: SortRule[];
    limit: number | null | undefined;
    rowCount: boolean;
    uniqueCount: boolean;
    primaryKeyColumns?: string[];
    groupRestriction?: GroupRestriction;
    /**
     * How a PREDICATE (WHERE, HAVING, the restriction's join) refers to a column. Only a dialect
     * whose FROM is aliased has one; the rest select bare names. Required — `undefined` must be
     * a decision, not an omission.
     */
    qualifyColumn: ColumnRefResolver | undefined;
    /**
     * How the PROJECTION and GROUP BY refer to a column — deliberately separate from
     * `qualifyColumn`. BigQuery qualifies its predicates but NOT its projection: after
     * `FROM … AS src` a bare name already resolves to a column of `src`, while qualifying it
     * would force nested-RECORD `AS` work. Required for the same reason.
     */
    qualifyProjection: ColumnRefResolver | undefined;
    /** Explicit `undefined` when the dialect has no field types — never silently omitted. */
    typeByColumn: ReadonlyMap<string, string> | undefined;
    /** Explicit `undefined` when the dialect inlines literals and needs no cast resolution. */
    resolveColumnType: ColumnTypeResolver | undefined;
  }): RenderedClause {
    const { qualifyColumn, typeByColumn, resolveColumnType } = opts;
    const agg = this.renderAggregatedSelect(
      opts.columns,
      opts.aggregations,
      buildDateTruncUnitMap(opts.dateTruncs),
      {
        includeRowCount: opts.rowCount,
        includeUniqueCount: opts.uniqueCount,
        primaryKeyColumns: opts.primaryKeyColumns,
        qualifyColumn: opts.qualifyProjection,
        timeZoneByColumn: buildTimeZoneMap(opts.dateTruncs),
        typeByColumn,
      }
    );
    // Totals under a metric filter: restrict this query to the rows of the groups the report
    // keeps, since a Totals query has no GROUP BY for a HAVING to apply to.
    const keptGroups = this.renderKeptGroupsJoin({
      restriction: opts.groupRestriction,
      fromClause: opts.fromClause,
      filters: opts.filters,
      qualifyColumn,
      typeByColumn,
      resolveColumnType,
    });
    const where = this.renderWhere(opts.filters, qualifyColumn, 'p', resolveColumnType);
    // Post-aggregation filters (rules carrying a `function`) become HAVING; WHERE skips them.
    const having = this.renderHaving(opts.filters, qualifyColumn, 'h', resolveColumnType);
    // ORDER BY must reference the output alias — a bare aggregated column is not in GROUP BY.
    const orderBy = this.renderOrderBy(
      opts.sort,
      this.buildAggregatedAliasResolver(agg.aliasByColumn)
    );
    const limit = this.renderLimit(opts.limit ?? null);

    return {
      sql:
        `${composeSelectFromClause(agg.selectSql, `${opts.fromClause}${keptGroups.sql}`)}` +
        `${where.sql}${agg.groupBySql}${having.sql}${orderBy.sql}${limit.sql}`,
      params: [
        ...keptGroups.params,
        ...where.params,
        ...having.params,
        ...orderBy.params,
        ...limit.params,
      ],
    };
  }

  /**
   * The join that restricts a Totals query to the rows of the groups its report keeps.
   *
   * Totals have no GROUP BY, so the report's metric (HAVING) filters cannot apply there — and
   * dropping them makes Totals summarise rows the report hides. This re-runs the report's own
   * grouping as a derived table and joins it: a GROUP BY result has distinct tuples, so it
   * filters rows without duplicating any, and every metric is then computed over the surviving
   * ROWS. That is what keeps a symmetric aggregate right — an entity in two surviving groups
   * still counts once — which summing per-group values would not.
   *
   * Returns an empty clause when the report has no metric filter, so the SQL is unchanged.
   */
  renderKeptGroupsJoin(opts: {
    restriction?: GroupRestriction;
    /** The SAME source expression the outer query reads (its own scope inside the subquery). */
    fromClause: string;
    filters: FilterRule[];
    /** How the OUTER query refers to a column — the subquery reads the same source. */
    qualifyColumn?: ColumnRefResolver;
    /**
     * Column → storage field type. Not optional: it decides the NaN-safe leg of the join, and a
     * dialect that forgets to pass it silently drops NaN rows from Totals instead of failing.
     * Pass `undefined` explicitly when the caller genuinely has no types.
     */
    typeByColumn: ReadonlyMap<string, string> | undefined;
    /** The SAME resolver the outer WHERE/HAVING uses, so a date cast matches byte-for-byte. */
    resolveColumnType: ColumnTypeResolver | undefined;
    alias?: string;
  }): RenderedClause {
    const restriction = opts.restriction;
    if (!restriction?.having.length) return { sql: '', params: [] };

    const alias = opts.alias ?? KEPT_GROUPS_CTE;
    const quotedAlias = this.quoteIdentifier(alias);
    // The buckets come from the RESTRICTION, not from this query's own `dateTruncs`: a Totals
    // query has none (no GROUP BY), so reading them here would regroup at the raw grain.
    const dateTruncs = restriction.dateTruncs ?? [];
    // No metrics in the projection: HAVING renders its own aggregate expressions, so the
    // subquery only has to carry the dimension tuple. Passing NO aggregation rules is also what
    // makes every dimension a GROUP BY key (see `buildKeptGroupsProjection`).
    const grouped = this.renderAggregatedSelect(
      restriction.dimensions,
      [],
      buildDateTruncUnitMap(dateTruncs),
      {
        qualifyColumn: opts.qualifyColumn,
        timeZoneByColumn: buildTimeZoneMap(dateTruncs),
        typeByColumn: opts.typeByColumn,
      }
    );
    const projection = buildKeptGroupsProjection(
      grouped.groupByParts,
      restriction.dimensions,
      name => this.quoteIdentifier(name)
    );
    const where = this.renderWhere(opts.filters, opts.qualifyColumn, 'kgp', opts.resolveColumnType);
    const having = this.renderHaving(
      restriction.having,
      opts.qualifyColumn,
      'kgh',
      opts.resolveColumnType
    );
    const subquery =
      `SELECT\n  ${projection.join(',\n  ')}\nFROM ${opts.fromClause}` +
      `${where.sql}${grouped.groupBySql}${having.sql}`;
    const params = [...where.params, ...having.params];

    // No dimensions: the report is a single grand-total group the HAVING either keeps or drops,
    // and a CROSS JOIN reproduces exactly that (zero rows out when it dropped).
    if (restriction.dimensions.length === 0) {
      return { sql: `\nCROSS JOIN (\n${subquery}\n) AS ${quotedAlias}`, params };
    }
    const pairs = buildKeptGroupsJoinPairs(
      grouped.groupByParts,
      restriction.dimensions,
      quotedAlias,
      name => this.quoteIdentifier(name),
      column => isFloatingPointType(opts.typeByColumn?.get(column))
    );
    return {
      sql: `\nJOIN (\n${subquery}\n) AS ${quotedAlias} ON ${this.renderNullSafeJoinOn(pairs)}`,
      params,
    };
  }

  /**
   * NULL-safe equality for a dimension-tuple join: `a = b OR (a IS NULL AND b IS NULL)`
   * per pair, ANDed. Used to join a metric sleeve back on the report dimensions without
   * dropping NULL-dimension buckets. BigQuery/Athena have no portable IS NOT DISTINCT FROM.
   */
  renderNullSafeJoinOn(pairs: { left: string; right: string; nanSafe?: boolean }[]): string {
    return pairs
      .map(({ left, right, nanSafe }) => {
        // GROUP BY buckets all NaNs together, but `NaN = NaN` is FALSE on BigQuery and Trino
        // (Snowflake, Redshift and Spark treat them as equal), so a float dimension holding a
        // NaN would land in one outer group yet match no sleeve row — a metric silently read
        // as NULL, or 0 once the COUNT DISTINCT pull coalesces. `x != x` is true only for NaN,
        // and is a harmless no-op on the dialects that already match.
        const nanLeg = nanSafe ? ` OR (${left} != ${left} AND ${right} != ${right})` : '';
        return `(${left} = ${right} OR (${left} IS NULL AND ${right} IS NULL)${nanLeg})`;
      })
      .join(' AND ');
  }

  /**
   * Hook for a dialect-specific invariant check on a freshly rendered fragment.
   * Default: no-op. Positional dialects (Athena `?`) override this to assert that
   * the placeholder count equals params.length — positional binding silently
   * misaligns every subsequent value when a fragment emits the wrong count, so
   * we fail fast at render time instead of producing a subtly wrong query.
   */
  protected validateFragment(_clause: RenderedClause): void {
    // no-op by default; named-parameter dialects (BigQuery `@name`) may reuse a
    // name across placeholders, so occurrence count need not equal params.length.
  }

  /**
   * IN/NOT IN for param-binding dialects: one placeholder and one param per value,
   * names advanced sequentially so positional binders stay aligned. `placeholderFor`
   * supplies the dialect's placeholder text for a given param name (BigQuery returns
   * `@name`/CAST-wrapped, Athena ignores the name and returns `?`).
   */
  protected renderInListWithParams(
    rule: Extract<FilterRule, { operator: 'in' | 'not_in' }>,
    col: string,
    paramName: string,
    placeholderFor: (name: string) => string
  ): RenderedClause {
    const placeholders: string[] = [];
    const params: SqlParameter[] = [];
    let name = paramName;
    for (const v of rule.value) {
      placeholders.push(placeholderFor(name));
      params.push({ name, value: v });
      name = this.nextParamName(name);
    }
    return {
      sql: this.inListSql(rule.operator, col, placeholders.join(', ')),
      params,
    };
  }

  /** IN/NOT IN for literal-inlining dialects: `lit` is the dialect's escaping formatter. */
  protected renderInListWithLiterals(
    rule: Extract<FilterRule, { operator: 'in' | 'not_in' }>,
    col: string,
    lit: (value: string | number | boolean | null) => string
  ): RenderedClause {
    return {
      sql: this.inListSql(rule.operator, col, rule.value.map(v => lit(v)).join(', ')),
      params: [],
    };
  }

  /**
   * Null-inclusive `NOT IN`: SQL `NOT IN` drops NULLs (UNKNOWN), but "is none of"
   * should keep rows where the column is missing — treat NULL as "not any of the
   * listed values". Matches the null-inclusive `neq` / `not_contains` operators.
   */
  private inListSql(operator: 'in' | 'not_in', col: string, list: string): string {
    return operator === 'in'
      ? `${col} IN (${list})`
      : `(${col} IS NULL OR ${col} NOT IN (${list}))`;
  }

  protected nextParamName(paramName: string): string {
    const match = paramName.match(/^(.*?)(\d+)$/);
    if (!match) {
      throw new Error(`Cannot derive next param name from "${paramName}"`);
    }
    return `${match[1]}${Number(match[2]) + 1}`;
  }
}
