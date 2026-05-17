import { ColumnRefResolver, SqlClauseRenderer, RenderedClause } from './sql-clause-renderer';
import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { SortRule } from '../../dto/schemas/sort-config.schema';

class StubRenderer extends SqlClauseRenderer {
  protected quoteIdentifier(name: string): string {
    return `"${name}"`;
  }
  protected renderFilterFragment(
    rule: FilterRule,
    paramName: string,
    columnRef: string
  ): RenderedClause {
    if (rule.operator === 'eq') {
      return {
        sql: `${columnRef} = @${paramName}`,
        params: [{ name: paramName, value: rule.value }],
      };
    }
    if (rule.operator === 'is_empty') {
      return { sql: `${columnRef} IS NULL`, params: [] };
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
    expect(r.renderLimit(0).sql).toBe('\nLIMIT 0');
  });

  it('rejects fractional, negative, NaN, and Infinity limits as defence-in-depth', () => {
    expect(() => r.renderLimit(10.7)).toThrow(/Invalid LIMIT value/);
    expect(() => r.renderLimit(-1)).toThrow(/Invalid LIMIT value/);
    expect(() => r.renderLimit(NaN)).toThrow(/Invalid LIMIT value/);
    expect(() => r.renderLimit(Infinity)).toThrow(/Invalid LIMIT value/);
  });

  it('omits LIMIT when null or undefined', () => {
    expect(r.renderLimit(null).sql).toBe('');
    expect(r.renderLimit(undefined).sql).toBe('');
  });

  describe('column qualification via ColumnRefResolver', () => {
    const qualify: ColumnRefResolver = column => `main."${column}"`;

    it('passes the resolved column reference into WHERE fragments', () => {
      const out = r.renderWhere(
        [
          { column: 'a', operator: 'eq', value: 1 },
          { column: 'b', operator: 'is_empty' },
        ],
        qualify
      );
      expect(out.sql).toBe('\nWHERE main."a" = @p0 AND main."b" IS NULL');
    });

    it('passes the resolved column reference into ORDER BY fragments', () => {
      const out = r.renderOrderBy(
        [
          { column: 'date', direction: 'desc' },
          { column: 'amount', direction: 'asc' },
        ],
        qualify
      );
      expect(out.sql).toBe('\nORDER BY main."date" DESC, main."amount" ASC');
    });

    it('lets the resolver route different columns to different prefixes', () => {
      const routed: ColumnRefResolver = column =>
        column === 'b' ? `orders."${column}"` : `main."${column}"`;
      const out = r.renderWhere(
        [
          { column: 'a', operator: 'eq', value: 1 },
          { column: 'b', operator: 'eq', value: 2 },
        ],
        routed
      );
      expect(out.sql).toBe('\nWHERE main."a" = @p0 AND orders."b" = @p1');
    });
  });
});
