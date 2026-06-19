import { Injectable } from '@nestjs/common';
import { RenderedClause, SqlClauseRenderer } from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';
import { escapeDatabricksIdentifier } from '../utils/databricks-identifier.utils';

/**
 * Formats a value as a Databricks (Spark SQL) literal. The renderer inlines every value
 * (params: []), so this escaping is the ONLY injection barrier. Spark interprets backslash
 * escape sequences in single-quoted string literals, so a literal backslash must be doubled
 * BEFORE single quotes are doubled (BigQuery/Snowflake-style, NOT Redshift's quote-only).
 * The same backslash-doubling also lets a user's regex metacharacter (`\d`) survive the
 * string-literal layer into RLIKE.
 */
function formatDatabricksLiteral(value: string | number | boolean | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite numeric filter value: ${String(value)}`);
    }
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

/**
 * Databricks renderer (option B). Inlines every value as a literal — fragments always
 * return params: []. Substring/affix matchers use Spark `contains`/`startswith`/`endswith`
 * (never LIKE) so user %/_ stay literal; regex uses infix `RLIKE` (Spark partial match).
 * Date/time value comparisons get a defensive CAST to the column type.
 */
@Injectable()
export class DatabricksClauseRenderer extends SqlClauseRenderer {
  // Databricks date/time types that take a defensive CAST around the inlined literal.
  private static readonly DATE_CAST_TYPES = new Set(['DATE', 'TIMESTAMP', 'TIMESTAMP_NTZ']);

  protected quoteIdentifier(name: string): string {
    return escapeDatabricksIdentifier(name);
  }

  protected validateFragment(clause: RenderedClause): void {
    if (clause.params.length !== 0) {
      throw new Error(
        `DatabricksClauseRenderer must inline all values, but a fragment emitted ` +
          `${clause.params.length} param(s): "${clause.sql}".`
      );
    }
  }

  private litCast(value: string | number | boolean | null, columnType?: string): string {
    const l = formatDatabricksLiteral(value);
    return columnType && DatabricksClauseRenderer.DATE_CAST_TYPES.has(columnType)
      ? `CAST(${l} AS ${columnType})`
      : l;
  }

  protected renderFilterFragment(
    rule: FilterRule,
    _paramName: string,
    col: string,
    columnType?: string
  ): RenderedClause {
    const lit = (v: string | number | boolean | null): string => this.litCast(v, columnType);
    // Text operators are validator-restricted to string columns: always a string literal.
    const text = (v: string | number | boolean | null): string =>
      formatDatabricksLiteral(String(v));
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
      case 'contains':
        return { sql: `contains(${col}, ${text(rule.value)})`, params: [] };
      case 'not_contains':
        return { sql: `NOT contains(${col}, ${text(rule.value)})`, params: [] };
      case 'starts_with':
        return { sql: `startswith(${col}, ${text(rule.value)})`, params: [] };
      case 'ends_with':
        return { sql: `endswith(${col}, ${text(rule.value)})`, params: [] };
      case 'regex':
        // Spark RLIKE is partial-match (Java find() semantics), unlike Snowflake's
        // full-anchored RLIKE — so `^prefix` works like the other storages. Live-verified.
        return { sql: `${col} RLIKE ${text(rule.value)}`, params: [] };
      case 'not_regex':
        return { sql: `NOT (${col} RLIKE ${text(rule.value)})`, params: [] };
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
      case 'relative_date':
        return { sql: this.renderRelativeDate(col, rule.value), params: [] };
    }
  }

  private renderRelativeDate(
    col: string,
    preset: Extract<FilterRule, { operator: 'relative_date' }>['value']
  ): string {
    // `n` is inlined into SQL; re-assert the integer locally (the injection barrier must
    // not live solely in the zod schema on the request path).
    if ('n' in preset && (!Number.isInteger(preset.n) || preset.n < 0)) {
      throw new Error(`Invalid relative_date n: ${String(preset.n)}`);
    }
    switch (preset.kind) {
      case 'today':
        return `${col} >= CURRENT_DATE AND ${col} < date_add(CURRENT_DATE, 1)`;
      case 'yesterday':
        return `${col} >= date_add(CURRENT_DATE, -1) AND ${col} < CURRENT_DATE`;
      case 'last_n_days':
        return (
          `${col} >= date_add(CURRENT_DATE, -${preset.n})` +
          ` AND ${col} < date_add(CURRENT_DATE, 1)`
        );
      case 'last_n_months':
        return (
          `${col} >= add_months(CURRENT_DATE, -${preset.n})` +
          ` AND ${col} < date_add(CURRENT_DATE, 1)`
        );
      case 'this_month':
        return (
          `${col} >= trunc(CURRENT_DATE, 'MONTH')` +
          ` AND ${col} < add_months(trunc(CURRENT_DATE, 'MONTH'), 1)`
        );
      case 'last_month':
        return (
          `${col} >= add_months(trunc(CURRENT_DATE, 'MONTH'), -1)` +
          ` AND ${col} < trunc(CURRENT_DATE, 'MONTH')`
        );
      case 'this_year':
        return (
          `${col} >= trunc(CURRENT_DATE, 'YEAR')` +
          ` AND ${col} < add_months(trunc(CURRENT_DATE, 'YEAR'), 12)`
        );
    }
  }
}
