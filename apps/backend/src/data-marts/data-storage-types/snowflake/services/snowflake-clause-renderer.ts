import { Injectable } from '@nestjs/common';
import { RenderedClause, SqlClauseRenderer } from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';
import { createIdentifierEscaper } from '../../utils/identifier-escaper.utils';

// Column references (filter/sort columns) are user-controlled (`FilterRule.column` is
// only `z.string().min(1)`), so they MUST go through the robust shared escaper that
// quotes every dotted part and doubles inner quotes — NOT `escapeSnowflakeIdentifier`,
// which is FQN-oriented (database.schema.table) and throws on 4+-part input, so it would
// reject legitimate dotted/struct column refs the shared escaper quotes per part.
const escapeColumnIdentifier = createIdentifierEscaper({ quoteChar: '"' });

/**
 * Formats a value as a Snowflake SQL literal. The Snowflake renderer inlines every
 * value (params: []), so this escaping is the ONLY injection barrier. Snowflake
 * interprets backslash escape sequences in single-quoted string literals, so a literal
 * backslash must be doubled BEFORE single quotes are doubled (BigQuery-style, NOT
 * Redshift's quote-only escaping).
 */
function formatSnowflakeLiteral(value: string | number | boolean | null): string {
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
 * Snowflake renderer (option B). Inlines every value as a literal — fragments always
 * return params: []. Substring/affix matchers use CONTAINS/STARTSWITH/ENDSWITH (never
 * LIKE) so user %/_ stay literal; regex uses REGEXP_INSTR>0 (partial match). Date/time
 * value comparisons get a defensive CAST to the column type — kept explicit even though the
 * live integration confirmed Snowflake also coerces a bare literal (explicit > implicit).
 */
@Injectable()
export class SnowflakeClauseRenderer extends SqlClauseRenderer {
  // The normalized SnowflakeFieldType vocabulary (TIMESTAMP_NTZ/LTZ/TZ, DATETIME all
  // collapse to TIMESTAMP upstream via parseSnowflakeFieldType) — so these three suffice.
  private static readonly DATE_CAST_TYPES = new Set(['DATE', 'TIME', 'TIMESTAMP']);

  protected quoteIdentifier(name: string): string {
    return escapeColumnIdentifier(name);
  }

  protected validateFragment(clause: RenderedClause): void {
    if (clause.params.length !== 0) {
      throw new Error(
        `SnowflakeClauseRenderer must inline all values, but a fragment emitted ` +
          `${clause.params.length} param(s): "${clause.sql}".`
      );
    }
  }

  private litCast(value: string | number | boolean | null, columnType?: string): string {
    const l = formatSnowflakeLiteral(value);
    return columnType && SnowflakeClauseRenderer.DATE_CAST_TYPES.has(columnType)
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
    const text = (v: string | number | boolean | null): string => formatSnowflakeLiteral(String(v));
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
        return { sql: `CONTAINS(${col}, ${text(rule.value)})`, params: [] };
      case 'not_contains':
        return { sql: `NOT CONTAINS(${col}, ${text(rule.value)})`, params: [] };
      case 'starts_with':
        return { sql: `STARTSWITH(${col}, ${text(rule.value)})`, params: [] };
      case 'ends_with':
        return { sql: `ENDSWITH(${col}, ${text(rule.value)})`, params: [] };
      case 'regex':
        // RLIKE/REGEXP_LIKE full-anchor the string in Snowflake; REGEXP_INSTR(...)>0 gives
        // the partial-match semantics the other storages (Athena/BQ/Redshift) use.
        return { sql: `REGEXP_INSTR(${col}, ${text(rule.value)}) > 0`, params: [] };
      case 'not_regex':
        return { sql: `REGEXP_INSTR(${col}, ${text(rule.value)}) = 0`, params: [] };
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
    if ('n' in preset && (!Number.isInteger(preset.n) || preset.n < 0)) {
      throw new Error(`Invalid relative_date n: ${String(preset.n)}`);
    }
    switch (preset.kind) {
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
