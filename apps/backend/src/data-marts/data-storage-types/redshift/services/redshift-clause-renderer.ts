import { Injectable } from '@nestjs/common';
import {
  ColumnRefResolver,
  RenderedClause,
  SqlClauseRenderer,
} from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';
import { DateTruncUnit } from '../../../dto/schemas/date-trunc-config.schema';
import { escapeRedshiftIdentifier } from '../utils/redshift-identifier.utils';

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
 * Redshift (PostgreSQL-derived) renderer. Unlike Athena/BigQuery it does NOT use
 * bound parameters: every fragment returns finished SQL with `params: []`. Substring
 * matchers use STRPOS/RIGHT (never LIKE) so user `%`/`_` stay literal. Date/time
 * values are bare quoted literals — Postgres `unknown`-literal coercion handles the
 * comparison (verified live). `columnType` is kept threaded as a CAST seam.
 */
@Injectable()
export class RedshiftClauseRenderer extends SqlClauseRenderer {
  protected quoteIdentifier(name: string): string {
    return escapeRedshiftIdentifier(name);
  }

  protected override textCastType(): string {
    return 'VARCHAR';
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

  // Redshift's CONCAT is strictly binary (exactly 2 args) — the base N-ary
  // CONCAT(a, sep, b, …) fails at run time for a composite PK. Join the parts with the
  // `||` operator instead (verified live: 3-arg CONCAT rejected, `||` chain accepted).
  protected override renderCountDistinctPrimaryKey(
    pkColumns: string[],
    qualify?: ColumnRefResolver
  ): string {
    const ref = (col: string): string => (qualify ? qualify(col) : this.quoteIdentifier(col));
    if (pkColumns.length === 1) {
      return `COUNT(DISTINCT ${ref(pkColumns[0])})`;
    }
    const SEP = "'␟'";
    const castType = this.textCastType();
    const parts = pkColumns.map(col => `COALESCE(CAST(${ref(col)} AS ${castType}), '')`);
    return `COUNT(DISTINCT ${parts.join(` || ${SEP} || `)})`;
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

  protected renderFilterFragment(
    rule: FilterRule,
    _paramName: string,
    col: string,
    _columnType?: string
  ): RenderedClause {
    const lit = (v: string | number | boolean | null): string => formatRedshiftLiteral(v);
    switch (rule.operator) {
      case 'eq':
        return { sql: `${col} = ${lit(rule.value)}`, params: [] };
      case 'neq':
        return { sql: `${col} <> ${lit(rule.value)}`, params: [] };
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
        return { sql: `STRPOS(${col}, ${lit(String(rule.value))}) > 0`, params: [] };
      case 'not_contains':
        return { sql: `STRPOS(${col}, ${lit(String(rule.value))}) = 0`, params: [] };
      case 'starts_with':
        return { sql: `STRPOS(${col}, ${lit(String(rule.value))}) = 1`, params: [] };
      case 'ends_with': {
        const v = lit(String(rule.value));
        return { sql: `RIGHT(${col}, LEN(${v})) = ${v}`, params: [] };
      }
      case 'regex':
        return { sql: `${col} ~ ${lit(String(rule.value))}`, params: [] };
      case 'not_regex':
        return { sql: `${col} !~ ${lit(String(rule.value))}`, params: [] };
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
        return { sql: `${col} IN (${rule.value.map(lit).join(', ')})`, params: [] };
      case 'not_in':
        return { sql: `${col} NOT IN (${rule.value.map(lit).join(', ')})`, params: [] };
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
      case 'this_year':
        return (
          `${col} >= DATE_TRUNC('year', CURRENT_DATE)` +
          ` AND ${col} < DATEADD(year, 1, DATE_TRUNC('year', CURRENT_DATE))`
        );
    }
  }
}
