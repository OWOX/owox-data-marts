import { Injectable } from '@nestjs/common';
import { SqlClauseRenderer, RenderedClause } from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';
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
      case 'this_year':
        return (
          `${lhs} >= DATE_TRUNC(CURRENT_DATE(), YEAR)` +
          ` AND ${lhs} < DATE_ADD(DATE_TRUNC(CURRENT_DATE(), YEAR), INTERVAL 1 YEAR)`
        );
    }
  }
}
