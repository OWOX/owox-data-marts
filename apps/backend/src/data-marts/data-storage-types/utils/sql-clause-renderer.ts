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

export abstract class SqlClauseRenderer {
  protected abstract quoteIdentifier(name: string): string;
  protected abstract renderFilterFragment(rule: FilterRule, paramName: string): RenderedClause;

  renderWhere(filters: FilterRule[]): RenderedClause {
    if (!filters.length) return { sql: '', params: [] };
    const fragments: string[] = [];
    const params: SqlParameter[] = [];
    let nextIndex = 0;
    for (const rule of filters) {
      const paramName = `p${nextIndex}`;
      const out = this.renderFilterFragment(rule, paramName);
      fragments.push(out.sql);
      params.push(...out.params);
      nextIndex += out.params.length;
    }
    return { sql: `\nWHERE ${fragments.join(' AND ')}`, params };
  }

  renderOrderBy(sort: SortRule[]): RenderedClause {
    if (!sort.length) return { sql: '', params: [] };
    const parts = sort.map(r => `${this.quoteIdentifier(r.column)} ${r.direction.toUpperCase()}`);
    return { sql: `\nORDER BY ${parts.join(', ')}`, params: [] };
  }

  renderLimit(limit: number | null | undefined): RenderedClause {
    if (limit == null) return { sql: '', params: [] };
    return { sql: `\nLIMIT ${Math.floor(limit)}`, params: [] };
  }
}
