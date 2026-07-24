import { AthenaClauseRenderer, countPositionalPlaceholders } from './athena-clause-renderer';
import { ColumnRefResolver, RenderedClause } from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';

describe('AthenaClauseRenderer', () => {
  const r = new AthenaClauseRenderer();

  describe('scalar operators (positional ?, double-quote identifiers)', () => {
    it('eq', () => {
      const out = r.renderWhere([{ column: 'name', operator: 'eq', value: 'X' }]);
      expect(out.sql).toBe('\nWHERE "name" = ?');
      expect(out.params).toEqual([{ name: 'p0', value: 'X' }]);
    });
    it('neq/gt/lt/gte/lte', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'neq', value: 1 }]).sql).toBe(
        '\nWHERE ("a" IS NULL OR "a" <> ?)'
      );
      expect(r.renderWhere([{ column: 'a', operator: 'gt', value: 1 }]).sql).toContain('>');
      expect(r.renderWhere([{ column: 'a', operator: 'lt', value: 1 }]).sql).toContain('<');
      expect(r.renderWhere([{ column: 'a', operator: 'gte', value: 1 }]).sql).toContain('>=');
      expect(r.renderWhere([{ column: 'a', operator: 'lte', value: 1 }]).sql).toContain('<=');
    });
    it('contains/not_contains use strpos (no wildcard smuggling)', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'contains', value: 'foo' }]).sql).toBe(
        '\nWHERE strpos("a", ?) > 0'
      );
      expect(r.renderWhere([{ column: 'a', operator: 'not_contains', value: 'X' }]).sql).toBe(
        '\nWHERE ("a" IS NULL OR strpos("a", ?) = 0)'
      );
    });
    it('starts_with uses strpos = 1', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'starts_with', value: 'X' }]).sql).toBe(
        '\nWHERE strpos("a", ?) = 1'
      );
    });
    it('ends_with uses substr from end (value bound twice)', () => {
      const out = r.renderWhere([{ column: 'a', operator: 'ends_with', value: 'X' }]);
      expect(out.sql).toBe('\nWHERE substr("a", -length(?)) = ?');
      expect(out.params).toEqual([
        { name: 'p0', value: 'X' },
        { name: 'p1', value: 'X' },
      ]);
    });
    it('substring matchers keep % and _ as literal characters', () => {
      const c = r.renderWhere([{ column: 'a', operator: 'contains', value: '100%' }]);
      expect(c.params).toEqual([{ name: 'p0', value: '100%' }]);
    });
    it('regex/not_regex use regexp_like', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'regex', value: '^x' }]).sql).toBe(
        '\nWHERE regexp_like("a", ?)'
      );
      expect(r.renderWhere([{ column: 'a', operator: 'not_regex', value: '^x' }]).sql).toBe(
        '\nWHERE ("a" IS NULL OR NOT regexp_like("a", ?))'
      );
    });
  });

  describe('no-value operators', () => {
    it('is_empty / is_not_empty', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'is_empty' }]).sql).toBe(
        '\nWHERE ("a" IS NULL OR "a" = \'\')'
      );
      expect(r.renderWhere([{ column: 'a', operator: 'is_not_empty' }]).sql).toBe(
        '\nWHERE ("a" IS NOT NULL AND "a" != \'\')'
      );
    });
    it('is_null / is_not_null', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'is_null' }]).sql).toBe('\nWHERE "a" IS NULL');
      expect(r.renderWhere([{ column: 'a', operator: 'is_not_null' }]).sql).toBe(
        '\nWHERE "a" IS NOT NULL'
      );
    });
    it('is_true / is_false', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'is_true' }]).sql).toBe('\nWHERE "a" = TRUE');
      expect(r.renderWhere([{ column: 'a', operator: 'is_false' }]).sql).toBe(
        '\nWHERE "a" = FALSE'
      );
    });
  });

  describe('between', () => {
    it('renders BETWEEN with two positional params', () => {
      const out = r.renderWhere([
        { column: 'amount', operator: 'between', value: { from: 1, to: 100 } },
      ]);
      expect(out.sql).toBe('\nWHERE "amount" BETWEEN ? AND ?');
      expect(out.params).toEqual([
        { name: 'p0', value: 1 },
        { name: 'p1', value: 100 },
      ]);
    });
    it('between then another rule advances param index', () => {
      const out = r.renderWhere([
        { column: 'amount', operator: 'between', value: { from: 1, to: 100 } },
        { column: 'name', operator: 'eq', value: 'X' },
      ]);
      expect(out.sql).toBe('\nWHERE "amount" BETWEEN ? AND ?\n  AND "name" = ?');
      expect(out.params.map(p => p.value)).toEqual([1, 100, 'X']);
    });
  });

  // Athena ExecutionParameters substitute as VARCHAR literals; Trino will not
  // compare a DATE/TIMESTAMP column to a varchar literal, so date/time value
  // comparisons must wrap the placeholder in CAST(? AS <type>).
  describe('typed date/time comparisons wrap the placeholder in CAST', () => {
    it('casts the placeholder for a value comparison on a TIMESTAMP column', () => {
      const out = r.renderWhere(
        [{ column: 'created_at', operator: 'gte', value: '2024-01-01' }],
        undefined,
        'p',
        () => 'TIMESTAMP'
      );
      expect(out.sql).toBe('\nWHERE "created_at" >= CAST(? AS TIMESTAMP)');
      expect(out.params).toEqual([{ name: 'p0', value: '2024-01-01' }]);
    });

    it('casts both bounds of a BETWEEN on a DATE column', () => {
      const out = r.renderWhere(
        [{ column: 'd', operator: 'between', value: { from: '2024-01-01', to: '2024-02-01' } }],
        undefined,
        'p',
        () => 'DATE'
      );
      expect(out.sql).toBe('\nWHERE "d" BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)');
      expect(out.params.map(p => p.value)).toEqual(['2024-01-01', '2024-02-01']);
    });

    it('casts to the zoned-timestamp type verbatim', () => {
      const out = r.renderWhere(
        [{ column: 'ts', operator: 'eq', value: '2024-01-01 00:00:00 UTC' }],
        undefined,
        'p',
        () => 'TIMESTAMP WITH TIME ZONE'
      );
      expect(out.sql).toBe('\nWHERE "ts" = CAST(? AS TIMESTAMP WITH TIME ZONE)');
    });

    it('does NOT cast string / number / bool columns', () => {
      expect(
        r.renderWhere(
          [{ column: 'name', operator: 'eq', value: 'x' }],
          undefined,
          'p',
          () => 'VARCHAR'
        ).sql
      ).toBe('\nWHERE "name" = ?');
      expect(
        r.renderWhere([{ column: 'n', operator: 'gt', value: 5 }], undefined, 'p', () => 'BIGINT')
          .sql
      ).toBe('\nWHERE "n" > ?');
    });

    it('does NOT cast when no type resolver is supplied (back-compat)', () => {
      expect(r.renderWhere([{ column: 'd', operator: 'gte', value: '2024-01-01' }]).sql).toBe(
        '\nWHERE "d" >= ?'
      );
    });

    it('keeps the placeholder/param invariant intact for cast fragments', () => {
      expect(() =>
        r.renderWhere(
          [{ column: 'd', operator: 'between', value: { from: '2024-01-01', to: '2024-02-01' } }],
          undefined,
          'p',
          () => 'TIMESTAMP'
        )
      ).not.toThrow();
    });
  });

  describe('relative_date (Trino date functions)', () => {
    // Half-open ranges (not equality) so the whole day matches on TIMESTAMP columns.
    it('today', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'today' } }]).sql
      ).toBe('\nWHERE "d" >= current_date AND "d" < date_add(\'day\', 1, current_date)');
    });
    it('yesterday', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'yesterday' } }])
          .sql
      ).toBe('\nWHERE "d" >= date_add(\'day\', -1, current_date) AND "d" < current_date');
    });
    it('last_n_days has an upper bound', () => {
      expect(
        r.renderWhere([
          { column: 'd', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } },
        ]).sql
      ).toBe(
        '\nWHERE "d" >= date_add(\'day\', -7, current_date) AND "d" < date_add(\'day\', 1, current_date)'
      );
    });
    it('last_n_months has an upper bound', () => {
      expect(
        r.renderWhere([
          { column: 'd', operator: 'relative_date', value: { kind: 'last_n_months', n: 3 } },
        ]).sql
      ).toBe(
        '\nWHERE "d" >= date_add(\'month\', -3, current_date) AND "d" < date_add(\'day\', 1, current_date)'
      );
    });
    it('this_month', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'this_month' } }])
          .sql
      ).toBe(
        `\nWHERE "d" >= date_trunc('month', current_date) AND "d" < date_add('month', 1, date_trunc('month', current_date))`
      );
    });
    it('last_month', () => {
      const sql = r.renderWhere([
        { column: 'd', operator: 'relative_date', value: { kind: 'last_month' } },
      ]).sql;
      expect(sql).toContain("date_trunc('month', date_add('month', -1, current_date))");
      expect(sql).toContain("date_trunc('month', current_date)");
    });
    it('this_year', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'this_year' } }])
          .sql
      ).toBe(
        `\nWHERE "d" >= date_trunc('year', current_date) AND "d" < date_add('year', 1, date_trunc('year', current_date))`
      );
    });
  });

  it('quotes dotted identifiers correctly', () => {
    expect(r.renderWhere([{ column: 'db.schema.col', operator: 'eq', value: 1 }]).sql).toBe(
      '\nWHERE "db"."schema"."col" = ?'
    );
  });

  describe('column qualification (blended path)', () => {
    const qualify: ColumnRefResolver = column => `main."${column}"`;
    it('honours the resolver in scalar/substring/relative_date', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'eq', value: 1 }], qualify).sql).toBe(
        '\nWHERE main."a" = ?'
      );
      expect(r.renderWhere([{ column: 'a', operator: 'contains', value: 'x' }], qualify).sql).toBe(
        '\nWHERE strpos(main."a", ?) > 0'
      );
      expect(
        r.renderWhere(
          [{ column: 'd', operator: 'relative_date', value: { kind: 'today' } }],
          qualify
        ).sql
      ).toBe('\nWHERE main."d" >= current_date AND main."d" < date_add(\'day\', 1, current_date)');
    });
    it('honours the resolver in ORDER BY', () => {
      expect(r.renderOrderBy([{ column: 'a', direction: 'asc' }], qualify).sql).toBe(
        '\nORDER BY\n  main."a" ASC'
      );
    });
    it('honours the resolver on both column references in last_month', () => {
      const sql = r.renderWhere(
        [{ column: 'd', operator: 'relative_date', value: { kind: 'last_month' } }],
        qualify
      ).sql;
      expect(sql).toContain(
        "main.\"d\" >= date_trunc('month', date_add('month', -1, current_date))"
      );
      expect(sql).toContain('main."d" < date_trunc(\'month\', current_date)');
    });
  });

  describe('multiple filters (AND combination)', () => {
    it('two scalar filters on different columns join with AND, params in order', () => {
      const out = r.renderWhere([
        { column: 'name', operator: 'eq', value: 'alice' },
        { column: 'id', operator: 'gt', value: 5 },
      ]);
      expect(out.sql).toBe('\nWHERE "name" = ?\n  AND "id" > ?');
      expect(out.params).toEqual([
        { name: 'p0', value: 'alice' },
        { name: 'p1', value: 5 },
      ]);
    });

    it('two filters on the SAME column both rendered with AND', () => {
      const out = r.renderWhere([
        { column: 'id', operator: 'gte', value: 2 },
        { column: 'id', operator: 'lte', value: 9 },
      ]);
      expect(out.sql).toBe('\nWHERE "id" >= ?\n  AND "id" <= ?');
      expect(out.params).toEqual([
        { name: 'p0', value: 2 },
        { name: 'p1', value: 9 },
      ]);
    });

    it('three filters preserve textual param ordering', () => {
      const out = r.renderWhere([
        { column: 'status', operator: 'eq', value: 'active' },
        { column: 'amount', operator: 'gte', value: 100 },
        { column: 'amount', operator: 'lte', value: 999 },
      ]);
      expect(out.sql).toBe('\nWHERE "status" = ?\n  AND "amount" >= ?\n  AND "amount" <= ?');
      expect(out.params.map(p => p.value)).toEqual(['active', 100, 999]);
    });
  });

  describe('LIMIT', () => {
    it('renders integer limit', () => {
      expect(r.renderLimit(100).sql).toBe('\nLIMIT 100');
    });
    it('rejects negative/non-integer', () => {
      expect(() => r.renderLimit(-1)).toThrow();
      expect(() => r.renderLimit(1.5)).toThrow();
    });
  });

  describe('positional placeholder/param invariant', () => {
    describe('countPositionalPlaceholders', () => {
      it('counts bare placeholders', () => {
        expect(countPositionalPlaceholders('"a" = ? AND "b" BETWEEN ? AND ?')).toBe(3);
      });
      it('ignores ? inside double-quoted identifiers', () => {
        expect(countPositionalPlaceholders('"weird?col" = ?')).toBe(1);
      });
      it('ignores ? inside single-quoted string literals', () => {
        expect(countPositionalPlaceholders('("c" IS NULL OR "c" = \'\') AND "d" = ?')).toBe(1);
        expect(countPositionalPlaceholders('"c" = \'why?\'')).toBe(0);
      });
    });

    it('every real operator renders a self-consistent fragment (no throw)', () => {
      // The renderer applies the invariant via validateFragment on every fragment;
      // exercising the full operator matrix proves none are mismatched today.
      const rules: FilterRule[] = [
        { column: 'a', operator: 'eq', value: 'x' },
        { column: 'a', operator: 'contains', value: 'x' },
        { column: 'a', operator: 'ends_with', value: 'x' },
        { column: 'a', operator: 'between', value: { from: 1, to: 9 } },
        { column: 'a', operator: 'is_empty' },
        { column: 'a', operator: 'is_null' },
        { column: 'd', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } },
      ];
      expect(() => rules.forEach(rule => r.renderWhere([rule]))).not.toThrow();
    });

    it('throws when a fragment emits more ? than params', () => {
      class BrokenTooManyPlaceholders extends AthenaClauseRenderer {
        protected renderFilterFragment(): RenderedClause {
          return { sql: '"a" = ? AND "b" = ?', params: [{ name: 'p0', value: 1 }] };
        }
      }
      const broken = new BrokenTooManyPlaceholders();
      expect(() => broken.renderWhere([{ column: 'a', operator: 'eq', value: 1 }])).toThrow(
        /placeholder\/param mismatch/
      );
    });

    it('throws when a fragment emits fewer ? than params', () => {
      class BrokenTooFewPlaceholders extends AthenaClauseRenderer {
        protected renderFilterFragment(): RenderedClause {
          return {
            sql: '"a" = ?',
            params: [
              { name: 'p0', value: 1 },
              { name: 'p1', value: 2 },
            ],
          };
        }
      }
      const broken = new BrokenTooFewPlaceholders();
      expect(() => broken.renderWhere([{ column: 'a', operator: 'eq', value: 1 }])).toThrow(
        /placeholder\/param mismatch/
      );
    });
  });
});
