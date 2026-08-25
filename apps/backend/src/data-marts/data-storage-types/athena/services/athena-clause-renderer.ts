import { Injectable } from '@nestjs/common';
import { RenderedClause, SqlClauseRenderer } from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';
import { DateTruncUnit } from '../../../dto/schemas/date-trunc-config.schema';
import { escapeAthenaIdentifier } from '../utils/athena-identifier.utils';
import { AthenaFieldType } from '../enums/athena-field-type.enum';
import { scanSql } from '../../../calculated-fields/sql-token-scanner';

/**
 * Counts positional `?` placeholders, ignoring any `?` that is not one: inside a double-quoted
 * identifier, a single-quoted string literal, or a COMMENT (Athena treats none of those as a
 * parameter marker — a column literally named `"a?b"`, the `''` in an is_empty check, or a
 * calculated field's own `-- why not CTR?`). Used to enforce the placeholder/param-count
 * invariant.
 *
 * Lexed rather than regex-stripped. A saved formula may legally carry SQL comments —
 * `FormulaViolations` recommends the `--` form by name — and a fragment built around such a
 * formula reaches this counter on every filtered run. Quote-stripping alone counted the `?` in
 * that comment and threw on a formula the validator had endorsed, since the save-time dry run
 * binds no parameters and so never reached the mismatch.
 */
export function countPositionalPlaceholders(sql: string): number {
  let count = 0;
  for (const token of scanSql(sql)) {
    if (token.kind !== 'punct') continue;
    for (const ch of token.value) {
      if (ch === '?') count++;
    }
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

  public override textCastType(): string {
    return 'VARCHAR';
  }

  /**
   * A declared type is an AthenaFieldType — the Glue/DDL vocabulary — while a query is Trino, which
   * has no FLOAT at all: Athena's own docs say to write `float` in DDL and `real` in a query.
   *
   * The whole float family targets DOUBLE, including the 32-bit declarations. Trino's faithful
   * answer to a declared FLOAT is REAL, but `revenue / clicks` already returns a double today with
   * no cast at all, and REAL would silently round it to ~7 significant digits — a changed number on
   * a path that works. DOUBLE is what the probe measured `12.75` through here, and what
   * `getFloatType` calls this storage's float type everywhere else. A cast may widen a declared
   * float; it must never narrow one.
   *
   * DECIMAL states its scale for the same reason textCastType states VARCHAR's absence of one: a
   * bare DECIMAL is (38,0) in Trino, and a cast to it truncates every fraction — the very defect
   * this mapping exists to fix.
   */
  private static readonly CAST_TYPE_BY_DECLARED_TYPE: ReadonlyMap<string, string> = new Map([
    [AthenaFieldType.TINYINT, 'TINYINT'],
    [AthenaFieldType.SMALLINT, 'SMALLINT'],
    [AthenaFieldType.INTEGER, 'INTEGER'],
    [AthenaFieldType.BIGINT, 'BIGINT'],
    [AthenaFieldType.FLOAT, 'DOUBLE'],
    [AthenaFieldType.REAL, 'DOUBLE'],
    [AthenaFieldType.DOUBLE, 'DOUBLE'],
    [AthenaFieldType.DECIMAL, 'DECIMAL(38,18)'],
  ]);

  public override castTypeForDeclaredType(declaredType: string): string | undefined {
    return AthenaClauseRenderer.CAST_TYPE_BY_DECLARED_TYPE.get(declaredType.trim().toUpperCase());
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

  // `valueCastType` is the declared type a Calculated Field's comparison imposes —
  // disjoint from the date set above, since it is only ever a numeric target. It matters most on
  // this dialect and BigQuery: an ExecutionParameter is typed from the value it carries, so `= 10`
  // raised `Cannot apply operator: varchar = integer` where `= '10'` returned the right row.
  private placeholder(columnType?: string, valueCastType?: string): string {
    const castType =
      valueCastType ??
      (columnType && AthenaClauseRenderer.DATE_CAST_TYPES.has(columnType) ? columnType : undefined);
    return castType ? `CAST(? AS ${castType})` : '?';
  }

  // Trino's approx_percentile takes only bigint/double/real, while percentiles are offered for
  // every numeric type — DECIMAL included.
  protected override renderPercentile(p: 25 | 50 | 75 | 95, columnRef: string): string {
    return `APPROX_PERCENTILE(CAST(${columnRef} AS DOUBLE), ${p / 100})`;
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
  //
  // The operand is PARENTHESISED because this is the one dialect that splices it into a postfix
  // operator rather than inside a function's parentheses, and Trino binds `AT TIME ZONE` tighter
  // than `+ - * /` and `||` — so a bare `a || b AT TIME ZONE 'tz'` would shift `b` alone. Nothing
  // compound reaches here today (a calculated field, the only non-atomic operand, is refused a
  // time zone by DATE_TRUNC_TIMEZONE_ON_CALCULATED_FIELD), but the seat is public and takes a
  // whole rendered expression, so lifting that refusal must not silently re-associate a formula.
  protected override renderDateTrunc(
    columnRef: string,
    unit: DateTruncUnit,
    timeZone?: string
  ): string {
    this.assertSafeDateTrunc(unit, timeZone);
    const expr = timeZone ? `(${columnRef}) AT TIME ZONE '${timeZone}'` : columnRef;
    return `date_trunc('${unit.toLowerCase()}', ${expr})`;
  }

  protected renderFilterFragment(
    rule: FilterRule,
    paramName: string,
    col: string,
    columnType?: string,
    valueCastType?: string
  ): RenderedClause {
    const ph = this.placeholder(columnType, valueCastType);
    switch (rule.operator) {
      case 'eq':
        return { sql: `${col} = ${ph}`, params: [{ name: paramName, value: rule.value }] };
      // Null-inclusive: SQL `<>` drops NULLs (UNKNOWN). BI expectation is that
      // "is not X" keeps rows where the column is missing — keep them explicitly.
      // Portable form: Redshift has no IS DISTINCT FROM, so all engines share this.
      case 'neq':
        return {
          sql: `(${col} IS NULL OR ${col} <> ${ph})`,
          params: [{ name: paramName, value: rule.value }],
        };
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
        // strpos(NULL, …) is NULL, so bare `= 0` drops NULL rows; keep them.
        return {
          sql: `(${col} IS NULL OR strpos(${col}, ?) = 0)`,
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
          sql: `(${col} IS NULL OR NOT regexp_like(${col}, ?))`,
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
      case 'not_in':
        // One positional placeholder per value, params in textual order.
        return this.renderInListWithParams(rule, col, paramName, () => ph);
      case 'relative_date':
        return { sql: this.renderRelativeDate(col, rule.value), params: [] };
    }
  }

  private renderRelativeDate(
    col: string,
    preset: Extract<FilterRule, { operator: 'relative_date' }>['value']
  ): string {
    // `n` is inlined into SQL below; re-assert the integer locally so the injection
    // barrier does not live solely in the zod schema on the request path (the other
    // renderers carry the same guard).
    if ('n' in preset && (!Number.isInteger(preset.n) || preset.n < 0)) {
      throw new Error(`Invalid relative_date n: ${String(preset.n)}`);
    }
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
