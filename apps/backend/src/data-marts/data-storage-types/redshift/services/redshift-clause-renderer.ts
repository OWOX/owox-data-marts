import { Injectable } from '@nestjs/common';
import { RenderedClause, SqlClauseRenderer } from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';
import { DateTruncUnit } from '../../../dto/schemas/date-trunc-config.schema';
import { escapeRedshiftIdentifier } from '../utils/redshift-identifier.utils';
import { RedshiftFieldType } from '../enums/redshift-field-type.enum';

/**
 * Formats a value as a Redshift SQL literal. This is the ONLY barrier between user
 * filter input and executed SQL — the Redshift Data API path has no bound-param
 * channel, so the renderer inlines literals and escaping must be airtight. Single
 * quotes are doubled (standard SQL). Assumes `standard_conforming_strings = on`
 * (backslash is an ordinary character) — verified by the integration suite.
 */
function formatRedshiftLiteral(value: string | number | boolean | null): string {
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
  return `'${value.split("'").join("''")}'`;
}

/**
 * Redshift (PostgreSQL-derived) renderer. Unlike Athena/BigQuery it does NOT use bound parameters:
 * every fragment returns finished SQL with `params: []`. Substring matchers use STRPOS/RIGHT (never
 * LIKE) so user `%`/`_` stay literal. Date/time values are bare quoted literals — Postgres
 * `unknown`-literal coercion handles the comparison (verified live).
 *
 * `renderFilterFragment` casts only where the caller states a target. Measured: `>` against a text
 * expression is LEXICOGRAPHIC here, so a FLOAT-declared formula returning '9', '10', '100' filtered
 * `> 5` returned `9` alone — a plausible one-row report, no error and no NULL.
 *
 * Two holes remain by choice. A rule carrying a FUNCTION compares the argument the SELECT printed
 * and only SUM/AVG/percentiles are cast, so `MIN` over a mis-declared text formula is still
 * lexicographic — casting it would change what "the minimum" MEANS. And `columnType` is accepted
 * but NOT read: a non-ISO date string filters to an empty report with no message, which a cast does
 * not remedy on any dialect either.
 */
@Injectable()
export class RedshiftClauseRenderer extends SqlClauseRenderer {
  protected quoteIdentifier(name: string): string {
    return escapeRedshiftIdentifier(name);
  }

  /**
   * Explicitly the MAXIMUM width, not a bare `VARCHAR`. Redshift is the one dialect that gives an
   * unqualified VARCHAR a default length — 256 — and an explicit CAST to a narrower type TRUNCATES
   * rather than failing. In the composite-key `COUNT(DISTINCT …)` tuple that is a silent
   * UNDERCOUNT: two keys differing only past character 256 become one, and the netstring's
   * `LENGTH()` prefix cannot rescue it because it measures the already-truncated value. Athena
   * (unbounded) and Snowflake (max by default) need no such qualifier.
   */
  public override textCastType(): string {
    return 'VARCHAR(65535)';
  }

  /**
   * The dialect the probe caught returning `12` where `12.75` is correct: Redshift coerces a text
   * expression to `Decimal` with SCALE 0 and truncates every row before summing. So the
   * exact types state their scale here, exactly as `textCastType` above states its length — a bare
   * DECIMAL/NUMERIC is (18,0) on Redshift, which is the same silent truncation wearing a CAST.
   * DOUBLE PRECISION is the spelling `SUM(CAST(… AS DOUBLE PRECISION))` returned `12.75` for live,
   * and a declared REAL widens to it rather than staying 32-bit: with no cast today an expression
   * already computes in float8, so a REAL target would drop ~9 significant digits from a number
   * that is correct. A cast may widen a declared float; it must never narrow one.
   */
  private static readonly CAST_TYPE_BY_DECLARED_TYPE: ReadonlyMap<string, string> = new Map([
    [RedshiftFieldType.SMALLINT, 'SMALLINT'],
    [RedshiftFieldType.INTEGER, 'INTEGER'],
    [RedshiftFieldType.BIGINT, 'BIGINT'],
    [RedshiftFieldType.REAL, 'DOUBLE PRECISION'],
    [RedshiftFieldType.DOUBLE_PRECISION, 'DOUBLE PRECISION'],
    [RedshiftFieldType.DECIMAL, 'DECIMAL(38,18)'],
    [RedshiftFieldType.NUMERIC, 'NUMERIC(38,18)'],
  ]);

  public override castTypeForDeclaredType(declaredType: string): string | undefined {
    return RedshiftClauseRenderer.CAST_TYPE_BY_DECLARED_TYPE.get(declaredType.trim().toUpperCase());
  }

  // This renderer inlines every value, so a fragment must never emit a bound param.
  // A future operator that forgets to inline fails fast here instead of silently
  // dropping a value (the run path would then send unbound SQL with no channel).
  protected validateFragment(clause: RenderedClause): void {
    if (clause.params.length !== 0) {
      throw new Error(
        `RedshiftClauseRenderer must inline all values, but a fragment emitted ` +
          `${clause.params.length} param(s): "${clause.sql}".`
      );
    }
  }

  protected override renderPercentile(p: 25 | 50 | 75 | 95, columnRef: string): string {
    return `PERCENTILE_CONT(${p / 100}) WITHIN GROUP (ORDER BY ${columnRef})`;
  }

  // CAST to VARCHAR so LISTAGG is valid on a non-string column (e.g. a DATE).
  protected override renderStringAgg(columnRef: string): string {
    return `LISTAGG(CAST(${columnRef} AS VARCHAR), ', ')`;
  }

  // Redshift's CONCAT is strictly binary (exactly 2 args), so the shared module's N-ary
  // CONCAT(a, sep, b, …) fails at run time (verified live: 3-arg CONCAT rejected, `||` chain
  // accepted). Stating the operator here is the WHOLE dialect difference — every expression built
  // on it (the Unique Count tuple, the value sleeve's row identity) inherits it, so there is one
  // place to change and nothing to keep in lockstep.
  public override textConcat(parts: readonly string[]): string {
    return parts.join(' || ');
  }

  // Redshift DATE_TRUNC takes a lowercase, single-quoted datepart. With a time zone,
  // CONVERT_TIMEZONE('tz', col) shifts the value before truncation.
  protected override renderDateTrunc(
    columnRef: string,
    unit: DateTruncUnit,
    timeZone?: string
  ): string {
    this.assertSafeDateTrunc(unit, timeZone);
    const expr = timeZone ? `CONVERT_TIMEZONE('${timeZone}', ${columnRef})` : columnRef;
    return `DATE_TRUNC('${unit.toLowerCase()}', ${expr})`;
  }

  // Redshift TRIM strips only the space character by default; BTRIM with an explicit
  // set makes tab/CR/LF-only cells blank too, matching the other dialects (#6779).
  // CHR() instead of escape literals — Redshift string literals don't interpret \t.
  protected override blankTrimmedExpression(columnRef: string): string {
    return `BTRIM(${columnRef}, ' ' || CHR(9) || CHR(10) || CHR(13))`;
  }

  protected renderFilterFragment(
    rule: FilterRule,
    _paramName: string,
    col: string,
    columnType?: string,
    valueCastType?: string
  ): RenderedClause {
    const lit = (v: string | number | boolean | null): string => {
      const l = formatRedshiftLiteral(v);
      return valueCastType ? `CAST(${l} AS ${valueCastType})` : l;
    };
    // Text-only operators (validator-restricted to string columns, mirroring the other dialects'
    // own `text` helper): a numeric target has no meaning inside STRPOS/RIGHT/`~`.
    const text = (v: string | number | boolean | null): string => formatRedshiftLiteral(String(v));
    switch (rule.operator) {
      case 'eq':
        return { sql: `${col} = ${lit(rule.value)}`, params: [] };
      // Null-inclusive: SQL `<>` drops NULLs (UNKNOWN). BI expectation is that
      // "is not X" keeps rows where the column is missing — keep them explicitly.
      // Portable form: Redshift has no IS DISTINCT FROM, so all engines share this.
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
      // Text-only operators: coerce to a string literal so STRPOS / ~ always get text
      // (validator restricts these to string columns; mirrors the Athena renderer).
      case 'contains':
        return { sql: `STRPOS(${col}, ${text(rule.value)}) > 0`, params: [] };
      case 'not_contains':
        // STRPOS(NULL, …) is NULL, so bare `= 0` drops NULL rows; keep them.
        return {
          sql: `(${col} IS NULL OR STRPOS(${col}, ${text(rule.value)}) = 0)`,
          params: [],
        };
      case 'starts_with':
        return { sql: `STRPOS(${col}, ${text(rule.value)}) = 1`, params: [] };
      case 'ends_with': {
        const v = text(rule.value);
        return { sql: `RIGHT(${col}, LEN(${v})) = ${v}`, params: [] };
      }
      case 'regex':
        return { sql: `${col} ~ ${text(rule.value)}`, params: [] };
      case 'not_regex':
        return {
          sql: `(${col} IS NULL OR ${col} !~ ${text(rule.value)})`,
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
      // midnight instant on TIMESTAMP/TIMESTAMPTZ columns. A range covers the
      // whole day for DATE and TIMESTAMP alike.
      case 'today':
        return `${col} >= CURRENT_DATE AND ${col} < DATEADD(day, 1, CURRENT_DATE)`;
      case 'yesterday':
        return `${col} >= DATEADD(day, -1, CURRENT_DATE) AND ${col} < CURRENT_DATE`;
      case 'last_n_days':
        return (
          `${col} >= DATEADD(day, -${preset.n}, CURRENT_DATE)` +
          ` AND ${col} < DATEADD(day, 1, CURRENT_DATE)`
        );
      case 'last_n_months':
        return (
          `${col} >= DATEADD(month, -${preset.n}, CURRENT_DATE)` +
          ` AND ${col} < DATEADD(day, 1, CURRENT_DATE)`
        );
      // Includes today, mirroring last_n_days (both cover today plus n days out/back).
      case 'next_n_days':
        return (
          `${col} >= CURRENT_DATE` + ` AND ${col} < DATEADD(day, ${preset.n + 1}, CURRENT_DATE)`
        );
      // Redshift DATE_TRUNC('week') is fixed to Monday (PostgreSQL semantics) — ISO.
      case 'this_week':
        return (
          `${col} >= DATE_TRUNC('week', CURRENT_DATE)` +
          ` AND ${col} < DATEADD(day, 7, DATE_TRUNC('week', CURRENT_DATE))`
        );
      case 'last_week':
        return (
          `${col} >= DATEADD(day, -7, DATE_TRUNC('week', CURRENT_DATE))` +
          ` AND ${col} < DATE_TRUNC('week', CURRENT_DATE)`
        );
      case 'this_month':
        return (
          `${col} >= DATE_TRUNC('month', CURRENT_DATE)` +
          ` AND ${col} < DATEADD(month, 1, DATE_TRUNC('month', CURRENT_DATE))`
        );
      case 'last_month':
        return (
          `${col} >= DATE_TRUNC('month', DATEADD(month, -1, CURRENT_DATE))` +
          ` AND ${col} < DATE_TRUNC('month', CURRENT_DATE)`
        );
      case 'this_quarter':
        return (
          `${col} >= DATE_TRUNC('quarter', CURRENT_DATE)` +
          ` AND ${col} < DATEADD(month, 3, DATE_TRUNC('quarter', CURRENT_DATE))`
        );
      case 'last_quarter':
        return (
          `${col} >= DATEADD(month, -3, DATE_TRUNC('quarter', CURRENT_DATE))` +
          ` AND ${col} < DATE_TRUNC('quarter', CURRENT_DATE)`
        );
      case 'this_year':
        return (
          `${col} >= DATE_TRUNC('year', CURRENT_DATE)` +
          ` AND ${col} < DATEADD(year, 1, DATE_TRUNC('year', CURRENT_DATE))`
        );
    }
  }
}
