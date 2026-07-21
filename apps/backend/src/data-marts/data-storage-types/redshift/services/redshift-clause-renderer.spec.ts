import { RedshiftClauseRenderer } from './redshift-clause-renderer';
import { ColumnRefResolver, RenderedClause } from '../../utils/sql-clause-renderer';

describe('RedshiftClauseRenderer', () => {
  const r = new RedshiftClauseRenderer();

  describe('scalar operators (inline literals, double-quote identifiers, no params)', () => {
    it('eq inlines a string literal and emits no params', () => {
      const out = r.renderWhere([{ column: 'name', operator: 'eq', value: 'X' }]);
      expect(out.sql).toBe(`\nWHERE "name" = 'X'`);
      expect(out.params).toEqual([]);
    });
    it('in / not_in inline escaped literals and emit no params', () => {
      const out = r.renderWhere([
        { column: 'channel', operator: 'in', value: ['fb', "O'Brien", 5] },
      ]);
      expect(out.sql).toBe(`\nWHERE "channel" IN ('fb', 'O''Brien', 5)`);
      expect(out.params).toEqual([]);
      expect(
        r.renderWhere([{ column: 'channel', operator: 'not_in', value: ['fb', 'google'] }]).sql
      ).toBe(`\nWHERE "channel" NOT IN ('fb', 'google')`);
    });
    it('neq/gt/lt/gte/lte', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'neq', value: 1 }]).sql).toBe(
        '\nWHERE "a" <> 1'
      );
      expect(r.renderWhere([{ column: 'a', operator: 'gt', value: 1 }]).sql).toBe(
        '\nWHERE "a" > 1'
      );
      expect(r.renderWhere([{ column: 'a', operator: 'lt', value: 1 }]).sql).toBe(
        '\nWHERE "a" < 1'
      );
      expect(r.renderWhere([{ column: 'a', operator: 'gte', value: 1 }]).sql).toBe(
        '\nWHERE "a" >= 1'
      );
      expect(r.renderWhere([{ column: 'a', operator: 'lte', value: 1 }]).sql).toBe(
        '\nWHERE "a" <= 1'
      );
    });
    it('contains/not_contains use STRPOS (no wildcard smuggling)', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'contains', value: 'foo' }]).sql).toBe(
        `\nWHERE STRPOS("a", 'foo') > 0`
      );
      expect(r.renderWhere([{ column: 'a', operator: 'not_contains', value: 'X' }]).sql).toBe(
        `\nWHERE STRPOS("a", 'X') = 0`
      );
    });
    it('starts_with uses STRPOS = 1', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'starts_with', value: 'X' }]).sql).toBe(
        `\nWHERE STRPOS("a", 'X') = 1`
      );
    });
    it('ends_with uses RIGHT(col, LEN(lit)) = lit', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'ends_with', value: 'X' }]).sql).toBe(
        `\nWHERE RIGHT("a", LEN('X')) = 'X'`
      );
    });
    it('substring matchers keep % and _ literal', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'contains', value: '100%' }]).sql).toBe(
        `\nWHERE STRPOS("a", '100%') > 0`
      );
    });
    it('regex/not_regex use ~ / !~', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'regex', value: '^x' }]).sql).toBe(
        `\nWHERE "a" ~ '^x'`
      );
      expect(r.renderWhere([{ column: 'a', operator: 'not_regex', value: '^x' }]).sql).toBe(
        `\nWHERE "a" !~ '^x'`
      );
    });
  });

  describe('no-value operators', () => {
    it('is_empty / is_not_empty', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'is_empty' }]).sql).toBe(
        `\nWHERE ("a" IS NULL OR "a" = '')`
      );
      expect(r.renderWhere([{ column: 'a', operator: 'is_not_empty' }]).sql).toBe(
        `\nWHERE ("a" IS NOT NULL AND "a" <> '')`
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
    it('inlines both bounds, no params', () => {
      const out = r.renderWhere([
        { column: 'amount', operator: 'between', value: { from: 1, to: 100 } },
      ]);
      expect(out.sql).toBe('\nWHERE "amount" BETWEEN 1 AND 100');
      expect(out.params).toEqual([]);
    });
  });

  describe('multiple filters (AND combination)', () => {
    it('inlines every literal across an AND chain, params stay empty', () => {
      const out = r.renderWhere([
        { column: 'name', operator: 'eq', value: "O'Brien" },
        { column: 'age', operator: 'gt', value: 30 },
      ]);
      expect(out.sql).toBe(`\nWHERE "name" = 'O''Brien'\n  AND "age" > 30`);
      expect(out.params).toEqual([]);
    });
  });

  describe('relative_date (Redshift date functions, half-open + upper bounds)', () => {
    it('today', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'today' } }]).sql
      ).toBe('\nWHERE "d" >= CURRENT_DATE AND "d" < DATEADD(day, 1, CURRENT_DATE)');
    });
    it('yesterday', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'yesterday' } }])
          .sql
      ).toBe('\nWHERE "d" >= DATEADD(day, -1, CURRENT_DATE) AND "d" < CURRENT_DATE');
    });
    it('last_n_days has an upper bound', () => {
      expect(
        r.renderWhere([
          { column: 'd', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } },
        ]).sql
      ).toBe(
        '\nWHERE "d" >= DATEADD(day, -7, CURRENT_DATE) AND "d" < DATEADD(day, 1, CURRENT_DATE)'
      );
    });
    it('last_n_months has an upper bound', () => {
      expect(
        r.renderWhere([
          { column: 'd', operator: 'relative_date', value: { kind: 'last_n_months', n: 3 } },
        ]).sql
      ).toBe(
        '\nWHERE "d" >= DATEADD(month, -3, CURRENT_DATE) AND "d" < DATEADD(day, 1, CURRENT_DATE)'
      );
    });
    it('this_month has an upper bound', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'this_month' } }])
          .sql
      ).toBe(
        `\nWHERE "d" >= DATE_TRUNC('month', CURRENT_DATE) AND "d" < DATEADD(month, 1, DATE_TRUNC('month', CURRENT_DATE))`
      );
    });
    it('last_month', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'last_month' } }])
          .sql
      ).toBe(
        `\nWHERE "d" >= DATE_TRUNC('month', DATEADD(month, -1, CURRENT_DATE)) AND "d" < DATE_TRUNC('month', CURRENT_DATE)`
      );
    });
    it('this_year has an upper bound', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'this_year' } }])
          .sql
      ).toBe(
        `\nWHERE "d" >= DATE_TRUNC('year', CURRENT_DATE) AND "d" < DATEADD(year, 1, DATE_TRUNC('year', CURRENT_DATE))`
      );
    });
    // `n` is inlined into SQL, so the renderer re-guards it even if a write path
    // bypassed the zod schema (z.number().int().positive().max(3650)).
    it('rejects a non-integer n', () => {
      expect(() =>
        r.renderWhere([
          { column: 'd', operator: 'relative_date', value: { kind: 'last_n_days', n: 7.5 } },
        ])
      ).toThrow('Invalid relative_date n');
    });
    it('rejects a non-numeric n that bypassed the validator', () => {
      expect(() =>
        r.renderWhere([
          {
            column: 'd',
            operator: 'relative_date',
            value: { kind: 'last_n_days', n: '1); DROP TABLE t --' as unknown as number },
          },
        ])
      ).toThrow('Invalid relative_date n');
    });
  });

  it('quotes dotted identifiers', () => {
    expect(r.renderWhere([{ column: 'db.schema.col', operator: 'eq', value: 1 }]).sql).toBe(
      '\nWHERE "db"."schema"."col" = 1'
    );
  });

  describe('column qualification (blended path)', () => {
    const qualify: ColumnRefResolver = column => `main."${column}"`;
    it('honours the resolver', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'eq', value: 1 }], qualify).sql).toBe(
        '\nWHERE main."a" = 1'
      );
      expect(r.renderOrderBy([{ column: 'a', direction: 'asc' }], qualify).sql).toBe(
        '\nORDER BY\n  main."a" ASC'
      );
    });
  });

  describe('SQL-injection safety (literal escaping is the only barrier)', () => {
    it("doubles a single quote (O'Brien)", () => {
      expect(r.renderWhere([{ column: 'name', operator: 'eq', value: "O'Brien" }]).sql).toBe(
        `\nWHERE "name" = 'O''Brien'`
      );
    });
    it('keeps a classic breakout payload inside one literal', () => {
      expect(r.renderWhere([{ column: 'name', operator: 'eq', value: "') OR 1=1 --" }]).sql).toBe(
        `\nWHERE "name" = ''') OR 1=1 --'`
      );
    });
    it('renders booleans / numbers / null as bare literals', () => {
      expect(r.renderWhere([{ column: 'b', operator: 'eq', value: true }]).sql).toBe(
        '\nWHERE "b" = TRUE'
      );
      expect(r.renderWhere([{ column: 'n', operator: 'eq', value: 0 }]).sql).toBe(
        '\nWHERE "n" = 0'
      );
    });
    // The schema rejects non-finite numbers, but the renderer inlines them, so it
    // re-guards: String(Infinity) would emit a bare `Infinity` token, not safe SQL.
    it('throws on a non-finite number that bypassed the schema', () => {
      expect(() => r.renderWhere([{ column: 'amount', operator: 'gt', value: Infinity }])).toThrow(
        'Non-finite numeric filter value'
      );
    });
    it('renders an empty string value as two adjacent single quotes', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'eq', value: '' }]).sql).toBe(
        `\nWHERE "a" = ''`
      );
    });
    it('treats backslash as an ordinary character (standard_conforming_strings = on)', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'eq', value: 'C:\\path' }]).sql).toBe(
        `\nWHERE "a" = 'C:\\path'`
      );
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

  describe('no-param invariant (validateFragment)', () => {
    it('throws if a fragment emits a bound param', () => {
      class Broken extends RedshiftClauseRenderer {
        protected renderFilterFragment(): RenderedClause {
          return { sql: '"a" = ?', params: [{ name: 'p0', value: 1 }] };
        }
      }
      expect(() => new Broken().renderWhere([{ column: 'a', operator: 'eq', value: 1 }])).toThrow(
        /must inline all values/
      );
    });
  });
});
