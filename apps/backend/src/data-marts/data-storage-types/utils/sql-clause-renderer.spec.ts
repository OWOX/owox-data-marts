import { SqlClauseRenderer, RenderedClause } from './sql-clause-renderer';
import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { SortRule } from '../../dto/schemas/sort-config.schema';

class StubRenderer extends SqlClauseRenderer {
  protected quoteIdentifier(name: string): string {
    return `"${name}"`;
  }
  protected renderFilterFragment(rule: FilterRule, paramName: string): RenderedClause {
    if (rule.operator === 'eq') {
      return {
        sql: `${this.quoteIdentifier(rule.column)} = @${paramName}`,
        params: [{ name: paramName, value: rule.value }],
      };
    }
    if (rule.operator === 'is_empty') {
      return { sql: `${this.quoteIdentifier(rule.column)} IS NULL`, params: [] };
    }
    return { sql: '1=1', params: [] };
  }
}

describe('SqlClauseRenderer', () => {
  const r = new StubRenderer();

  it('renders empty when no clauses given', () => {
    expect(r.renderWhere([]).sql).toBe('');
    expect(r.renderOrderBy([]).sql).toBe('');
    expect(r.renderLimit(null).sql).toBe('');
  });

  it('renders single filter as WHERE', () => {
    const out = r.renderWhere([{ column: 'a', operator: 'eq', value: 1 }]);
    expect(out.sql).toBe('\nWHERE "a" = @p0');
    expect(out.params).toEqual([{ name: 'p0', value: 1 }]);
  });

  it('joins multiple filters with AND and increments param indices correctly', () => {
    const out = r.renderWhere([
      { column: 'a', operator: 'eq', value: 1 },
      { column: 'b', operator: 'is_empty' },
    ]);
    expect(out.sql).toBe('\nWHERE "a" = @p0 AND "b" IS NULL');
    expect(out.params).toEqual([{ name: 'p0', value: 1 }]);
  });

  it('renders ORDER BY with multiple columns', () => {
    const sort: SortRule[] = [
      { column: 'date', direction: 'desc' },
      { column: 'amount', direction: 'asc' },
    ];
    expect(r.renderOrderBy(sort).sql).toBe('\nORDER BY "date" DESC, "amount" ASC');
  });

  it('renders LIMIT', () => {
    expect(r.renderLimit(100).sql).toBe('\nLIMIT 100');
  });

  it('floors fractional limit values', () => {
    expect(r.renderLimit(10.7).sql).toBe('\nLIMIT 10');
  });

  it('omits LIMIT when null or undefined', () => {
    expect(r.renderLimit(null).sql).toBe('');
    expect(r.renderLimit(undefined).sql).toBe('');
  });
});
