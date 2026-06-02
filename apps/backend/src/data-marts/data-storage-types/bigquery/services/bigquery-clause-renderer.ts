import { Injectable } from '@nestjs/common';
import { SqlClauseRenderer, RenderedClause } from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';
import { escapeBigQueryIdentifier } from '../utils/bigquery-identifier.utils';

@Injectable()
export class BigQueryClauseRenderer extends SqlClauseRenderer {
  protected quoteIdentifier(name: string): string {
    return escapeBigQueryIdentifier(name);
  }

  protected renderFilterFragment(rule: FilterRule, paramName: string, col: string): RenderedClause {
    switch (rule.operator) {
      case 'eq':
        return { sql: `${col} = @${paramName}`, params: [{ name: paramName, value: rule.value }] };
      case 'neq':
        return { sql: `${col} != @${paramName}`, params: [{ name: paramName, value: rule.value }] };
      case 'gt':
        return { sql: `${col} > @${paramName}`, params: [{ name: paramName, value: rule.value }] };
      case 'lt':
        return { sql: `${col} < @${paramName}`, params: [{ name: paramName, value: rule.value }] };
      case 'gte':
        return { sql: `${col} >= @${paramName}`, params: [{ name: paramName, value: rule.value }] };
      case 'lte':
        return { sql: `${col} <= @${paramName}`, params: [{ name: paramName, value: rule.value }] };
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
          sql: `${col} BETWEEN @${p1} AND @${p2}`,
          params: [
            { name: p1, value: rule.value.from },
            { name: p2, value: rule.value.to },
          ],
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
      case 'today':
        return `${col} = CURRENT_DATE()`;
      case 'yesterday':
        return `${col} = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)`;
      case 'last_n_days':
        return `${col} >= DATE_SUB(CURRENT_DATE(), INTERVAL ${preset.n} DAY)`;
      case 'last_n_months':
        return `${col} >= DATE_SUB(CURRENT_DATE(), INTERVAL ${preset.n} MONTH)`;
      case 'this_month':
        return `${col} >= DATE_TRUNC(CURRENT_DATE(), MONTH)`;
      case 'last_month':
        return (
          `${col} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH)` +
          ` AND ${col} < DATE_TRUNC(CURRENT_DATE(), MONTH)`
        );
      case 'this_year':
        return `${col} >= DATE_TRUNC(CURRENT_DATE(), YEAR)`;
    }
  }
}
