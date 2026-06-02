import { Injectable } from '@nestjs/common';
import { RenderedClause, SqlClauseRenderer } from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';
import { escapeAthenaIdentifier } from '../utils/athena-identifier.utils';

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

  protected renderFilterFragment(rule: FilterRule, paramName: string, col: string): RenderedClause {
    switch (rule.operator) {
      case 'eq':
        return { sql: `${col} = ?`, params: [{ name: paramName, value: rule.value }] };
      case 'neq':
        return { sql: `${col} != ?`, params: [{ name: paramName, value: rule.value }] };
      case 'gt':
        return { sql: `${col} > ?`, params: [{ name: paramName, value: rule.value }] };
      case 'lt':
        return { sql: `${col} < ?`, params: [{ name: paramName, value: rule.value }] };
      case 'gte':
        return { sql: `${col} >= ?`, params: [{ name: paramName, value: rule.value }] };
      case 'lte':
        return { sql: `${col} <= ?`, params: [{ name: paramName, value: rule.value }] };
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
          sql: `${col} BETWEEN ? AND ?`,
          params: [
            { name: paramName, value: rule.value.from },
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
        return `${col} = current_date`;
      case 'yesterday':
        return `${col} = date_add('day', -1, current_date)`;
      case 'last_n_days':
        return `${col} >= date_add('day', -${preset.n}, current_date)`;
      case 'last_n_months':
        return `${col} >= date_add('month', -${preset.n}, current_date)`;
      case 'this_month':
        return `${col} >= date_trunc('month', current_date)`;
      case 'last_month':
        return (
          `${col} >= date_trunc('month', date_add('month', -1, current_date))` +
          ` AND ${col} < date_trunc('month', current_date)`
        );
      case 'this_year':
        return `${col} >= date_trunc('year', current_date)`;
    }
  }
}
