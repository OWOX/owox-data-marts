import { Injectable } from '@nestjs/common';
import { RenderedClause, SqlClauseRenderer } from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';
import { DateTruncUnit } from '../../../dto/schemas/date-trunc-config.schema';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DuckdbFieldType } from '../enums/duckdb-field-type.enum';
import { escapeDuckDbIdentifier } from '../utils/duckdb-identifier.utils';

/**
 * Formats a value as a DuckDB SQL literal. The DuckDB renderer inlines every value
 * (params: []), so this escaping is the ONLY injection barrier. Unlike
 * Snowflake/Databricks, DuckDB's plain single-quoted string literals are
 * standard-conforming — backslash is an ordinary character, NOT an escape
 * introducer (verified live: `SELECT 'a\b'` round-trips as the 3-char string `a\b`;
 * only a Postgres-style `E'...'` prefix processes backslash escapes, and this
 * renderer never emits that form). So — like Redshift — only single quotes are
 * doubled; a literal backslash is never touched.
 */
function formatDuckDbLiteral(value: string | number | boolean | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') {
    // Inlined directly, so re-assert finiteness even though the schema validates it:
    // String(Infinity) would emit `Infinity` as a bare SQL token, not a safe rejection.
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite numeric filter value: ${String(value)}`);
    }
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * DuckDB renderer. Like Redshift/Snowflake/Databricks (and unlike Athena's positional
 * `?` / BigQuery's named `@p`), DuckDB has no bound-parameter channel on this read
 * path, so every fragment inlines its value as a literal and returns `params: []`.
 * Substring/affix matchers use the DuckDB boolean scalar functions
 * `contains`/`starts_with`/`ends_with` (never LIKE) so user `%`/`_` stay literal;
 * regex uses `regexp_matches` (partial match, like the other dialects — all
 * live-verified against the installed DuckDB engine). Date/time value comparisons are
 * bare quoted literals — DuckDB implicitly casts a VARCHAR literal to DATE/TIMESTAMP in
 * a comparison context (verified live: `DATE '2024-01-01' > '2023-01-01'` -> true), so
 * no defensive CAST is needed (mirrors Redshift's rationale).
 */
@Injectable()
export class DuckDbClauseRenderer extends SqlClauseRenderer {
  readonly type = DataStorageType.DUCKDB;

  protected quoteIdentifier(name: string): string {
    return escapeDuckDbIdentifier(name);
  }

  public override textCastType(): string {
    return 'VARCHAR';
  }

  // DuckDB's declared field-type vocabulary (DuckdbFieldType) IS its SQL vocabulary, so both
  // numeric entries are identities — there is no BigQuery-style `FLOAT`/`FLOAT64` divergence to
  // translate, and no 32-bit float to widen. NUMERIC vocabulary only: the remaining declarations
  // (BOOLEAN, DATE, TIMESTAMP, TIMESTAMPTZ, TIME, VARCHAR) intentionally have no entry, so the
  // caller emits no cast for them rather than letting a date spelling reach a pre-DATE_TRUNC cast.
  private static readonly CAST_TYPE_BY_DECLARED_TYPE: ReadonlyMap<string, string> = new Map([
    [DuckdbFieldType.BIGINT, 'BIGINT'],
    [DuckdbFieldType.DOUBLE, 'DOUBLE'],
  ]);

  public override castTypeForDeclaredType(declaredType: string): string | undefined {
    return DuckDbClauseRenderer.CAST_TYPE_BY_DECLARED_TYPE.get(declaredType.trim().toUpperCase());
  }

  // This renderer inlines every value, so a fragment must never emit a bound param.
  // A future operator that forgets to inline fails fast here instead of silently
  // dropping a value (the run path would then send unbound SQL with no channel).
  protected validateFragment(clause: RenderedClause): void {
    if (clause.params.length !== 0) {
      throw new Error(
        `DuckDbClauseRenderer must inline all values, but a fragment emitted ` +
          `${clause.params.length} param(s): "${clause.sql}".`
      );
    }
  }

  // DuckDB quantile_cont wants a [0, 1] fraction, not a 0-100 percentage (live-verified:
  // quantile_cont(x, 50) is rejected with "Binder Error: QUANTILE can only take
  // parameters in the range [-1, 1]") — mirrors every other dialect's `p / 100`.
  protected override renderPercentile(p: 25 | 50 | 75 | 95, columnRef: string): string {
    return `quantile_cont(${columnRef}, ${p / 100})`;
  }

  // CAST to VARCHAR so string_agg is valid on a non-string column (e.g. a DATE).
  protected override renderStringAgg(columnRef: string): string {
    return `string_agg(CAST(${columnRef} AS VARCHAR), ', ')`;
  }

  // DuckDB date_trunc takes a lowercase, single-quoted unit (live-verified). `AT TIME
  // ZONE` is direction-sensitive in DuckDB and is NOT a drop-in mirror of Trino/Athena's:
  // on a naive TIMESTAMP, `ts AT TIME ZONE 'z'` means "interpret this wall-clock value as
  // being IN zone z" and converts it to a TIMESTAMPTZ (the instant that wall-clock reading
  // corresponds to in z) — the OPPOSITE of what bucketing a stored UTC instant needs.
  // Live-verified: a single shift on `TIMESTAMP '2024-03-01 02:00:00' AT TIME ZONE
  // 'America/New_York'` keeps the date at 2024-03-01 (wrong). The correct idiom is a
  // DOUBLE shift: `(ts AT TIME ZONE 'UTC')` first reinterprets the naive value AS a UTC
  // instant (naive TIMESTAMP -> TIMESTAMPTZ), then `AT TIME ZONE '<tz>'` on that
  // TIMESTAMPTZ converts it back down to a naive wall-clock TIMESTAMP showing local time
  // in the target zone (TIMESTAMPTZ -> TIMESTAMP AT TIME ZONE means "local time in this
  // zone for this instant"). Live-verified this correctly buckets the same instant into
  // 2024-02-29, and holds across a half-hour-offset zone (Asia/Kolkata) and a Southern-
  // hemisphere DST zone (Australia/Sydney).
  // A TIMESTAMPTZ is an instant: one conversion into the zone (UTC by default) picks its day.
  protected override renderDateTrunc(
    columnRef: string,
    unit: DateTruncUnit,
    timeZone?: string,
    columnType?: string
  ): string {
    this.assertSafeDateTrunc(unit, timeZone);
    const type = columnType?.trim().toUpperCase();
    let expr = columnRef;
    if (type === DuckdbFieldType.TIMESTAMPTZ) {
      expr = `(${columnRef}) AT TIME ZONE '${timeZone ?? 'UTC'}'`;
    } else if (timeZone) {
      expr = `((${columnRef}) AT TIME ZONE 'UTC') AT TIME ZONE '${timeZone}'`;
    }
    const bucket = `date_trunc('${unit.toLowerCase()}', ${expr})`;
    // date_trunc returns a TIMESTAMP even for a DATE; a DATE column keeps its type.
    return type === DuckdbFieldType.DATE ? `CAST(${bucket} AS DATE)` : bucket;
  }

  // DuckDB trim() strips only the space character; the explicit set makes tab/CR/LF-only
  // cells blank too, matching the other dialects (#6779). Live-verified.
  protected override blankTrimmedExpression(columnRef: string): string {
    return `trim(${columnRef}, ' ' || chr(9) || chr(10) || chr(13))`;
  }

  protected renderFilterFragment(
    rule: FilterRule,
    _paramName: string,
    column: string,
    columnType?: string,
    valueCastType?: string
  ): RenderedClause {
    // Zone-less literals and CURRENT_DATE mean UTC: createHardenedInstance sets the session zone.
    // A LIST or STRUCT is declared VARCHAR and filters as its text; on a real VARCHAR it is a no-op.
    const col =
      columnType?.trim().toUpperCase() === DuckdbFieldType.VARCHAR
        ? `CAST(${column} AS VARCHAR)`
        : column;
    // `valueCastType` is the numeric type a Calculated Field's comparison imposes.
    const lit = (v: string | number | boolean | null): string => {
      const l = formatDuckDbLiteral(v);
      return valueCastType ? `CAST(${l} AS ${valueCastType})` : l;
    };
    // Text-only operators: coerce to a string literal so contains/starts_with/ends_with/
    // regexp_matches always get text (validator restricts these to string columns;
    // mirrors the Redshift/Databricks renderers).
    const text = (v: string | number | boolean | null): string => formatDuckDbLiteral(String(v));
    switch (rule.operator) {
      case 'eq':
        return { sql: `${col} = ${lit(rule.value)}`, params: [] };
      // Null-inclusive: SQL `<>` drops NULLs; "is not X" keeps rows where the column is missing.
      case 'neq':
        return { sql: `(${col} IS NULL OR ${col} <> ${lit(rule.value)})`, params: [] };
      case 'gt':
        return { sql: `${col} > ${lit(rule.value)}`, params: [] };
      case 'lt':
        return { sql: `${col} < ${lit(rule.value)}`, params: [] };
      case 'gte':
        return { sql: `${col} >= ${lit(rule.value)}`, params: [] };
      case 'lte':
        return { sql: `${col} <= ${lit(rule.value)}`, params: [] };
      case 'contains':
        return { sql: `contains(${col}, ${text(rule.value)})`, params: [] };
      case 'not_contains':
        return {
          sql: `(${col} IS NULL OR NOT contains(${col}, ${text(rule.value)}))`,
          params: [],
        };
      case 'starts_with':
        return { sql: `starts_with(${col}, ${text(rule.value)})`, params: [] };
      case 'ends_with':
        return { sql: `ends_with(${col}, ${text(rule.value)})`, params: [] };
      case 'regex':
        // Partial match (like grep), consistent with every other dialect's chosen
        // partial-match semantics for `regex` (live-verified).
        return { sql: `regexp_matches(${col}, ${text(rule.value)})`, params: [] };
      case 'not_regex':
        return {
          sql: `(${col} IS NULL OR NOT regexp_matches(${col}, ${text(rule.value)}))`,
          params: [],
        };
      case 'is_blank':
      case 'is_not_blank':
        return this.renderBlankFragment(rule.operator, col, columnType);
      // Legacy pair (#6779): accepted for saved configs, no longer offered by pickers.
      case 'is_empty':
        return { sql: `(${col} IS NULL OR ${col} = '')`, params: [] };
      case 'is_not_empty':
        return { sql: `(${col} IS NOT NULL AND ${col} <> '')`, params: [] };
      case 'is_null':
        return { sql: `${col} IS NULL`, params: [] };
      case 'is_not_null':
        return { sql: `${col} IS NOT NULL`, params: [] };
      case 'is_true':
        return { sql: `${col} = TRUE`, params: [] };
      case 'is_false':
        return { sql: `${col} = FALSE`, params: [] };
      case 'between':
        return {
          sql: `${col} BETWEEN ${lit(rule.value.from)} AND ${lit(rule.value.to)}`,
          params: [],
        };
      case 'in':
      case 'not_in':
        return this.renderInListWithLiterals(rule, col, lit);
      case 'relative_date':
        return { sql: this.renderRelativeDate(col, rule.value), params: [] };
    }
  }

  private renderRelativeDate(
    col: string,
    preset: Extract<FilterRule, { operator: 'relative_date' }>['value']
  ): string {
    // `n` is inlined into SQL below; re-assert the integer locally so the injection
    // barrier does not live solely in the zod schema on the request path.
    if ('n' in preset && (!Number.isInteger(preset.n) || preset.n < 0)) {
      throw new Error(`Invalid relative_date n: ${String(preset.n)}`);
    }
    switch (preset.kind) {
      // Half-open ranges (not equality): `col = CURRENT_DATE` matches only the
      // midnight instant on a TIMESTAMP column. A range covers the whole day for
      // DATE and TIMESTAMP alike.
      case 'today':
        return `${col} >= CURRENT_DATE AND ${col} < CURRENT_DATE + INTERVAL 1 DAY`;
      case 'yesterday':
        return `${col} >= CURRENT_DATE - INTERVAL 1 DAY AND ${col} < CURRENT_DATE`;
      case 'last_n_days':
        return (
          `${col} >= CURRENT_DATE - INTERVAL ${preset.n} DAY` +
          ` AND ${col} < CURRENT_DATE + INTERVAL 1 DAY`
        );
      case 'last_n_months':
        return (
          `${col} >= CURRENT_DATE - INTERVAL ${preset.n} MONTH` +
          ` AND ${col} < CURRENT_DATE + INTERVAL 1 DAY`
        );
      // Includes today, mirroring last_n_days (both cover today plus n days out/back).
      case 'next_n_days':
        return `${col} >= CURRENT_DATE AND ${col} < CURRENT_DATE + INTERVAL ${preset.n + 1} DAY`;
      // DuckDB's date_trunc('week', …) is ISO — weeks start on Monday, like Spark's
      // trunc(date, 'WEEK') used by the Databricks renderer.
      case 'this_week':
        return (
          `${col} >= date_trunc('week', CURRENT_DATE)` +
          ` AND ${col} < date_trunc('week', CURRENT_DATE) + INTERVAL 7 DAY`
        );
      case 'last_week':
        return (
          `${col} >= date_trunc('week', CURRENT_DATE) - INTERVAL 7 DAY` +
          ` AND ${col} < date_trunc('week', CURRENT_DATE)`
        );
      case 'this_month':
        return (
          `${col} >= date_trunc('month', CURRENT_DATE)` +
          ` AND ${col} < date_trunc('month', CURRENT_DATE) + INTERVAL 1 MONTH`
        );
      case 'last_month':
        return (
          `${col} >= date_trunc('month', CURRENT_DATE) - INTERVAL 1 MONTH` +
          ` AND ${col} < date_trunc('month', CURRENT_DATE)`
        );
      case 'this_quarter':
        return (
          `${col} >= date_trunc('quarter', CURRENT_DATE)` +
          ` AND ${col} < date_trunc('quarter', CURRENT_DATE) + INTERVAL 3 MONTH`
        );
      case 'last_quarter':
        return (
          `${col} >= date_trunc('quarter', CURRENT_DATE) - INTERVAL 3 MONTH` +
          ` AND ${col} < date_trunc('quarter', CURRENT_DATE)`
        );
      case 'this_year':
        return (
          `${col} >= date_trunc('year', CURRENT_DATE)` +
          ` AND ${col} < date_trunc('year', CURRENT_DATE) + INTERVAL 1 YEAR`
        );
    }
  }
}
