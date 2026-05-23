import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { SortRule } from '../../dto/schemas/sort-config.schema';

export interface SqlParameter {
  name: string;
  value: string | number | boolean | null;
}

export interface RenderedClause {
  sql: string;
  params: SqlParameter[];
}

/**
 * Returns the SQL fragment for a column reference — fully quoted and, when
 * needed, prefixed with a CTE alias. The renderer cannot derive the prefix
 * from the column name alone, so the caller supplies one.
 */
export type ColumnRefResolver = (column: string) => string;

export abstract class SqlClauseRenderer {
  protected abstract quoteIdentifier(name: string): string;
  protected abstract renderFilterFragment(
    rule: FilterRule,
    paramName: string,
    columnRef: string
  ): RenderedClause;

  private resolverOrFallback(qualifyColumn: ColumnRefResolver | undefined): ColumnRefResolver {
    return qualifyColumn ?? (c => this.quoteIdentifier(c));
  }

  renderWhere(
    filters: FilterRule[],
    qualifyColumn?: ColumnRefResolver,
    paramPrefix = 'p'
  ): RenderedClause {
    if (!filters.length) return { sql: '', params: [] };
    const resolve = this.resolverOrFallback(qualifyColumn);
    const fragments: string[] = [];
    const params: SqlParameter[] = [];
    let nextIndex = 0;
    for (const rule of filters) {
      const paramName = `${paramPrefix}${nextIndex}`;
      const out = this.renderFilterFragment(rule, paramName, resolve(rule.column));
      fragments.push(out.sql);
      params.push(...out.params);
      nextIndex += out.params.length;
    }
    return { sql: `\nWHERE ${fragments.join(' AND ')}`, params };
  }

  renderOrderBy(sort: SortRule[], qualifyColumn?: ColumnRefResolver): RenderedClause {
    if (!sort.length) return { sql: '', params: [] };
    const resolve = this.resolverOrFallback(qualifyColumn);
    const parts = sort.map(r => `${resolve(r.column)} ${r.direction.toUpperCase()}`);
    return { sql: `\nORDER BY ${parts.join(', ')}`, params: [] };
  }

  renderLimit(limit: number | null | undefined): RenderedClause {
    if (limit == null) return { sql: '', params: [] };
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error(`Invalid LIMIT value: ${String(limit)}`);
    }
    return { sql: `\nLIMIT ${limit}`, params: [] };
  }
}
