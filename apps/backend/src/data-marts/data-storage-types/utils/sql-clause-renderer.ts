import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { SortRule } from '../../dto/schemas/sort-config.schema';
import { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import { ReportAggregateFunction } from '../../dto/schemas/aggregate-function.schema';
import {
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
    }
  ): { selectSql: string; groupBySql: string; aliasByColumn: ReadonlyMap<string, string> } {
    const qualify = opts?.qualifyColumn;
    const timeZoneByColumn = opts?.timeZoneByColumn;
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
        const truncated = this.renderDateTrunc(ref, unit, timeZoneByColumn?.get(c));
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
    return { selectSql: selectParts.join(',\n  '), groupBySql, aliasByColumn };
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
  protected renderDateTrunc(_columnRef: string, _unit: DateTruncUnit, _timeZone?: string): string {
    throw new Error('renderDateTrunc not implemented for this dialect');
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

  protected renderPercentile(_p: 25 | 50 | 75 | 95, _columnRef: string): string {
    throw new Error(`Percentile aggregation not supported for this storage`);
  }

  protected renderStringAgg(_columnRef: string): string {
    throw new Error(`STRING_AGG not supported for this storage`);
  }

  protected renderAnyValue(columnRef: string): string {
    return `ANY_VALUE(${columnRef})`;
  }

  protected renderAggregateExpression(fn: ReportAggregateFunction, columnRef: string): string {
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

  protected nextParamName(paramName: string): string {
    const match = paramName.match(/^(.*?)(\d+)$/);
    if (!match) {
      throw new Error(`Cannot derive next param name from "${paramName}"`);
    }
    return `${match[1]}${Number(match[2]) + 1}`;
  }
}
