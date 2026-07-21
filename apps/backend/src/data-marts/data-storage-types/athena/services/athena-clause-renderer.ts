import { Injectable } from '@nestjs/common';
import { RenderedClause, SqlClauseRenderer } from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';
import { DateTruncUnit } from '../../../dto/schemas/date-trunc-config.schema';
import { escapeAthenaIdentifier } from '../utils/athena-identifier.utils';

/**
 * Counts positional `?` placeholders, ignoring any `?` inside a double-quoted
 * identifier or single-quoted string literal (Athena never treats those as
 * parameter markers, e.g. a column literally named `"a?b"` or the `''` in an
 * is_empty check). Used to enforce the placeholder/param-count invariant.
 */
export function countPositionalPlaceholders(sql: string): number {
  const withoutQuoted = sql.replace(/"[^"]*"|'[^']*'/g, '');
  let count = 0;
  for (const ch of withoutQuoted) {
    if (ch === '?') count++;
  }
  return count;
}

/**
 * Trino/Presto (Athena engine v3) renderer. Uses positional `?` placeholders
 * bound via Athena ExecutionParameters — order of the returned params MUST match
 * the textual order of `?` in the final SQL. Substring matchers use strpos/substr
 * (never LIKE) so user input never smuggles `%`/`_` wildcards.
 */
@Injectable()
export class AthenaClauseRenderer extends SqlClauseRenderer {
  protected quoteIdentifier(name: string): string {
    return escapeAthenaIdentifier(name);
  }

  protected override textCastType(): string {
    return 'VARCHAR';
  }

  // Positional binding maps params to `?` by order, so a fragment that emits a
  // different number of `?` than params would silently shift every later value.
  // Fail fast at render time instead.
  protected validateFragment(clause: RenderedClause): void {
    const placeholders = countPositionalPlaceholders(clause.sql);
    if (placeholders !== clause.params.length) {
      throw new Error(
        `AthenaClauseRenderer placeholder/param mismatch: ${placeholders} '?' vs ` +
          `${clause.params.length} param(s) in fragment "${clause.sql}". ` +
          `Positional binding requires exactly one param per '?' in textual order.`
      );
    }
  }

  // Date/time column types whose value comparisons need a typed placeholder.
  // ExecutionParameters bind as VARCHAR literals and Trino refuses to compare a
  // DATE/TIMESTAMP column to varchar, so `?` becomes `CAST(? AS <type>)`.
  private static readonly DATE_CAST_TYPES = new Set([
    'DATE',
    'TIME',
    'TIMESTAMP',
    'TIME WITH TIME ZONE',
    'TIMESTAMP WITH TIME ZONE',
  ]);

  private placeholder(columnType?: string): string {
    return columnType && AthenaClauseRenderer.DATE_CAST_TYPES.has(columnType)
      ? `CAST(? AS ${columnType})`
      : '?';
  }

  protected override renderPercentile(p: 25 | 50 | 75 | 95, columnRef: string): string {
    return `APPROX_PERCENTILE(${columnRef}, ${p / 100})`;
  }

  // CAST to VARCHAR so array_agg/array_join is valid on a non-string column (e.g. a DATE).
  protected override renderStringAgg(columnRef: string): string {
    return `array_join(array_agg(CAST(${columnRef} AS VARCHAR)), ', ')`;
  }

  // Trino does not guarantee ANY_VALUE across engine versions; arbitrary() is the all-version-safe form.
  protected override renderAnyValue(columnRef: string): string {
    return `arbitrary(${columnRef})`;
  }

  // Trino date_trunc takes a lowercase, single-quoted unit. With a time zone, the
  // column is shifted via `AT TIME ZONE 'tz'` before truncation.
  protected override renderDateTrunc(
    columnRef: string,
    unit: DateTruncUnit,
    timeZone?: string
  ): string {
    this.assertSafeDateTrunc(unit, timeZone);
    const expr = timeZone ? `${columnRef} AT TIME ZONE '${timeZone}'` : columnRef;
    return `date_trunc('${unit.toLowerCase()}', ${expr})`;
  }

  protected renderFilterFragment(
    rule: FilterRule,
    paramName: string,
    col: string,
    columnType?: string
  ): RenderedClause {
    const ph = this.placeholder(columnType);
    switch (rule.operator) {
      case 'eq':
        return { sql: `${col} = ${ph}`, params: [{ name: paramName, value: rule.value }] };
      case 'neq':
        return { sql: `${col} != ${ph}`, params: [{ name: paramName, value: rule.value }] };
      case 'gt':
        return { sql: `${col} > ${ph}`, params: [{ name: paramName, value: rule.value }] };
      case 'lt':
        return { sql: `${col} < ${ph}`, params: [{ name: paramName, value: rule.value }] };
      case 'gte':
        return { sql: `${col} >= ${ph}`, params: [{ name: paramName, value: rule.value }] };
      case 'lte':
        return { sql: `${col} <= ${ph}`, params: [{ name: paramName, value: rule.value }] };
      case 'contains':
        return {
          sql: `strpos(${col}, ?) > 0`,
          params: [{ name: paramName, value: String(rule.value) }],
        };
      case 'not_contains':
        return {
          sql: `strpos(${col}, ?) = 0`,
          params: [{ name: paramName, value: String(rule.value) }],
        };
      case 'starts_with':
        return {
          sql: `strpos(${col}, ?) = 1`,
          params: [{ name: paramName, value: String(rule.value) }],
        };
      case 'ends_with': {
        const p2 = this.nextParamName(paramName);
        return {
          sql: `substr(${col}, -length(?)) = ?`,
          params: [
            { name: paramName, value: String(rule.value) },
            { name: p2, value: String(rule.value) },
          ],
        };
      }
      case 'regex':
        return { sql: `regexp_like(${col}, ?)`, params: [{ name: paramName, value: rule.value }] };
      case 'not_regex':
        return {
          sql: `NOT regexp_like(${col}, ?)`,
          params: [{ name: paramName, value: rule.value }],
        };
      case 'is_empty':
        return { sql: `(${col} IS NULL OR ${col} = '')`, params: [] };
      case 'is_not_empty':
        return { sql: `(${col} IS NOT NULL AND ${col} != '')`, params: [] };
      case 'is_null':
        return { sql: `${col} IS NULL`, params: [] };
      case 'is_not_null':
        return { sql: `${col} IS NOT NULL`, params: [] };
      case 'is_true':
        return { sql: `${col} = TRUE`, params: [] };
      case 'is_false':
        return { sql: `${col} = FALSE`, params: [] };
      case 'between': {
        const p2 = this.nextParamName(paramName);
        return {
          sql: `${col} BETWEEN ${ph} AND ${ph}`,
          params: [
            { name: paramName, value: rule.value.from },
            { name: p2, value: rule.value.to },
          ],
        };
      }
      case 'in':
      case 'not_in': {
        // One positional placeholder per value, params in textual order.
        const params: { name: string; value: string | number | boolean | null }[] = [];
        let name = paramName;
        for (const v of rule.value) {
          params.push({ name, value: v });
          name = this.nextParamName(name);
        }
        return {
          sql: `${col} ${rule.operator === 'in' ? 'IN' : 'NOT IN'} (${rule.value.map(() => ph).join(', ')})`,
          params,
        };
      }
      case 'relative_date':
        return { sql: this.renderRelativeDate(col, rule.value), params: [] };
    }
  }

  private renderRelativeDate(
    col: string,
    preset: Extract<FilterRule, { operator: 'relative_date' }>['value']
  ): string {
    switch (preset.kind) {
      // Half-open ranges, not equality: `col = current_date` only matches the
      // midnight instant on a TIMESTAMP/DATETIME column (a row at 13:45 is
      // excluded). A range covers the whole day for both DATE and TIMESTAMP
      // columns (Trino coerces DATE → TIMESTAMP in the comparison).
      case 'today':
        return `${col} >= current_date AND ${col} < date_add('day', 1, current_date)`;
      case 'yesterday':
        return `${col} >= date_add('day', -1, current_date) AND ${col} < current_date`;
      case 'last_n_days':
        return (
          `${col} >= date_add('day', -${preset.n}, current_date)` +
          ` AND ${col} < date_add('day', 1, current_date)`
        );
      case 'last_n_months':
        return (
          `${col} >= date_add('month', -${preset.n}, current_date)` +
          ` AND ${col} < date_add('day', 1, current_date)`
        );
      // Includes today, mirroring last_n_days (both cover today plus n days out/back).
      case 'next_n_days':
        return (
          `${col} >= current_date` + ` AND ${col} < date_add('day', ${preset.n + 1}, current_date)`
        );
      // Trino date_trunc('week') is ISO — Monday start.
      case 'this_week':
        return (
          `${col} >= date_trunc('week', current_date)` +
          ` AND ${col} < date_add('week', 1, date_trunc('week', current_date))`
        );
      case 'last_week':
        return (
          `${col} >= date_add('week', -1, date_trunc('week', current_date))` +
          ` AND ${col} < date_trunc('week', current_date)`
        );
      case 'this_month':
        return (
          `${col} >= date_trunc('month', current_date)` +
          ` AND ${col} < date_add('month', 1, date_trunc('month', current_date))`
        );
      case 'last_month':
        return (
          `${col} >= date_trunc('month', date_add('month', -1, current_date))` +
          ` AND ${col} < date_trunc('month', current_date)`
        );
      case 'this_quarter':
        return (
          `${col} >= date_trunc('quarter', current_date)` +
          ` AND ${col} < date_add('month', 3, date_trunc('quarter', current_date))`
        );
      case 'last_quarter':
        return (
          `${col} >= date_add('month', -3, date_trunc('quarter', current_date))` +
          ` AND ${col} < date_trunc('quarter', current_date)`
        );
      case 'this_year':
        return (
          `${col} >= date_trunc('year', current_date)` +
          ` AND ${col} < date_add('year', 1, date_trunc('year', current_date))`
        );
    }
  }
}
