import { Injectable } from '@nestjs/common';
import { SqlClauseRenderer, RenderedClause } from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';
import { DateTruncUnit } from '../../../dto/schemas/date-trunc-config.schema';
import { escapeBigQueryIdentifier } from '../utils/bigquery-identifier.utils';

@Injectable()
export class BigQueryClauseRenderer extends SqlClauseRenderer {
  protected quoteIdentifier(name: string): string {
    return escapeBigQueryIdentifier(name);
  }

  // Column types whose values carry a time component: relative_date must compare
  // the DATE part against CURRENT_DATE()-based bounds, since BigQuery does not
  // coerce TIMESTAMP/DATETIME to DATE in a comparison (it raises a type error).
  private static readonly SUBDAY_DATE_TYPES = new Set([
    'DATETIME',
    'TIMESTAMP',
    'TIMESTAMP WITH TIME ZONE',
  ]);

  // Date/time column types whose value comparisons need a typed placeholder. The
  // BigQuery SDK infers a param's type from its JS value, so a date filter binds
  // as STRING and `date_col = @p` raises "No matching signature for =" — wrap the
  // placeholder in CAST(@p AS <type>) so the string is parsed to the column type.
  private static readonly DATE_CAST_TYPES = new Set(['DATE', 'DATETIME', 'TIME', 'TIMESTAMP']);

  private placeholder(paramName: string, columnType?: string): string {
    return columnType && BigQueryClauseRenderer.DATE_CAST_TYPES.has(columnType)
      ? `CAST(@${paramName} AS ${columnType})`
      : `@${paramName}`;
  }

  protected override renderPercentile(p: 25 | 50 | 75 | 95, columnRef: string): string {
    return `APPROX_QUANTILES(${columnRef}, 100)[OFFSET(${p})]`;
  }

  // CAST to STRING so STRING_AGG is valid on a non-string column (e.g. a DATE).
  protected override renderStringAgg(columnRef: string): string {
    return `STRING_AGG(CAST(${columnRef} AS STRING), ', ')`;
  }

  // Reduces a date/time column to a DATE bucket. The wrap depends on the column type
  // (verified on real BigQuery):
  //   - DATE: DATE_TRUNC accepts a DATE directly; the DATE() wrap is redundant (and a
  //     DATE column never carries a tz — the validator rejects that upstream).
  //   - TIMESTAMP (± tz) / DATETIME without tz: DATE(col[, tz]) covers these directly.
  //   - DATETIME WITH tz: there is no DATE(DATETIME, tz) overload, so interpret the
  //     tz-naive wall clock in the target zone via TIMESTAMP(datetime, tz) first, then
  //     read the date back in that zone.
  protected override renderDateTrunc(
    columnRef: string,
    unit: DateTruncUnit,
    timeZone?: string,
    columnType?: string
  ): string {
    this.assertSafeDateTrunc(unit, timeZone);
    const type = columnType?.trim().toUpperCase();
    let dateExpr: string;
    if (type === 'DATE') {
      dateExpr = columnRef;
    } else if (timeZone && type === 'DATETIME') {
      dateExpr = `DATE(TIMESTAMP(${columnRef}, '${timeZone}'), '${timeZone}')`;
    } else {
      dateExpr = timeZone ? `DATE(${columnRef}, '${timeZone}')` : `DATE(${columnRef})`;
    }
    return `DATE_TRUNC(${dateExpr}, ${unit})`;
  }

  protected renderFilterFragment(
    rule: FilterRule,
    paramName: string,
    col: string,
    columnType?: string
  ): RenderedClause {
    const ph = this.placeholder(paramName, columnType);
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
      // Substring/affix matchers use BigQuery built-ins instead of LIKE.
      // BigQuery's LIKE has no ESCAPE clause, so user input "100%" or "a_b"
      // would smuggle wildcards. STRPOS / STARTS_WITH / ENDS_WITH treat the
      // bound parameter as a literal substring with no special characters.
      case 'contains':
        return {
          sql: `STRPOS(${col}, @${paramName}) > 0`,
          params: [{ name: paramName, value: String(rule.value) }],
        };
      case 'not_contains':
        return {
          sql: `STRPOS(${col}, @${paramName}) = 0`,
          params: [{ name: paramName, value: String(rule.value) }],
        };
      case 'starts_with':
        return {
          sql: `STARTS_WITH(${col}, @${paramName})`,
          params: [{ name: paramName, value: String(rule.value) }],
        };
      case 'ends_with':
        return {
          sql: `ENDS_WITH(${col}, @${paramName})`,
          params: [{ name: paramName, value: String(rule.value) }],
        };
      case 'regex':
        return {
          sql: `REGEXP_CONTAINS(${col}, @${paramName})`,
          params: [{ name: paramName, value: rule.value }],
        };
      case 'not_regex':
        return {
          sql: `NOT REGEXP_CONTAINS(${col}, @${paramName})`,
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
        const p1 = paramName;
        const p2 = this.nextParamName(paramName);
        return {
          sql: `${col} BETWEEN ${this.placeholder(p1, columnType)} AND ${this.placeholder(p2, columnType)}`,
          params: [
            { name: p1, value: rule.value.from },
            { name: p2, value: rule.value.to },
          ],
        };
      }
      case 'in':
      case 'not_in': {
        const placeholders: string[] = [];
        const params: { name: string; value: string | number | boolean | null }[] = [];
        let name = paramName;
        for (const v of rule.value) {
          placeholders.push(this.placeholder(name, columnType));
          params.push({ name, value: v });
          name = this.nextParamName(name);
        }
        return {
          sql: `${col} ${rule.operator === 'in' ? 'IN' : 'NOT IN'} (${placeholders.join(', ')})`,
          params,
        };
      }
      case 'relative_date':
        return { sql: this.renderRelativeDate(col, rule.value, columnType), params: [] };
    }
  }

  private renderRelativeDate(
    col: string,
    preset: Extract<FilterRule, { operator: 'relative_date' }>['value'],
    columnType?: string
  ): string {
    // Compare the DATE part of a sub-day column so the whole day matches and the
    // DATE-typed bounds don't raise a type mismatch. DATE columns compare directly.
    const lhs =
      columnType && BigQueryClauseRenderer.SUBDAY_DATE_TYPES.has(columnType) ? `DATE(${col})` : col;
    switch (preset.kind) {
      case 'today':
        return `${lhs} = CURRENT_DATE()`;
      case 'yesterday':
        return `${lhs} = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)`;
      case 'last_n_days':
        return (
          `${lhs} >= DATE_SUB(CURRENT_DATE(), INTERVAL ${preset.n} DAY)` +
          ` AND ${lhs} <= CURRENT_DATE()`
        );
      case 'last_n_months':
        return (
          `${lhs} >= DATE_SUB(CURRENT_DATE(), INTERVAL ${preset.n} MONTH)` +
          ` AND ${lhs} <= CURRENT_DATE()`
        );
      // Includes today, mirroring last_n_days (both cover today plus n days out/back).
      case 'next_n_days':
        return (
          `${lhs} >= CURRENT_DATE()` +
          ` AND ${lhs} <= DATE_ADD(CURRENT_DATE(), INTERVAL ${preset.n} DAY)`
        );
      // ISOWEEK, not WEEK: BigQuery's plain WEEK starts on Sunday, while every other
      // storage truncates weeks to Monday — ISOWEEK keeps the boundary consistent.
      case 'this_week':
        return (
          `${lhs} >= DATE_TRUNC(CURRENT_DATE(), ISOWEEK)` +
          ` AND ${lhs} < DATE_ADD(DATE_TRUNC(CURRENT_DATE(), ISOWEEK), INTERVAL 7 DAY)`
        );
      case 'last_week':
        return (
          `${lhs} >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), ISOWEEK), INTERVAL 7 DAY)` +
          ` AND ${lhs} < DATE_TRUNC(CURRENT_DATE(), ISOWEEK)`
        );
      case 'this_month':
        return (
          `${lhs} >= DATE_TRUNC(CURRENT_DATE(), MONTH)` +
          ` AND ${lhs} < DATE_ADD(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH)`
        );
      case 'last_month':
        return (
          `${lhs} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH)` +
          ` AND ${lhs} < DATE_TRUNC(CURRENT_DATE(), MONTH)`
        );
      case 'this_quarter':
        return (
          `${lhs} >= DATE_TRUNC(CURRENT_DATE(), QUARTER)` +
          ` AND ${lhs} < DATE_ADD(DATE_TRUNC(CURRENT_DATE(), QUARTER), INTERVAL 3 MONTH)`
        );
      case 'last_quarter':
        return (
          `${lhs} >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), QUARTER), INTERVAL 3 MONTH)` +
          ` AND ${lhs} < DATE_TRUNC(CURRENT_DATE(), QUARTER)`
        );
      case 'this_year':
        return (
          `${lhs} >= DATE_TRUNC(CURRENT_DATE(), YEAR)` +
          ` AND ${lhs} < DATE_ADD(DATE_TRUNC(CURRENT_DATE(), YEAR), INTERVAL 1 YEAR)`
        );
    }
  }
}
