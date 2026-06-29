import { BigQueryClauseRenderer } from './bigquery-clause-renderer';
import { ColumnRefResolver } from '../../utils/sql-clause-renderer';

describe('BigQueryClauseRenderer', () => {
  const r = new BigQueryClauseRenderer();

  describe('scalar operators', () => {
    it('eq', () => {
      const out = r.renderWhere([{ column: 'name', operator: 'eq', value: 'X' }]);
      expect(out.sql).toBe('\nWHERE `name` = @p0');
      expect(out.params).toEqual([{ name: 'p0', value: 'X' }]);
    });
    it('neq', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'neq', value: 1 }]).sql).toContain('!=');
    });
    it('gt/lt/gte/lte', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'gt', value: 1 }]).sql).toContain('>');
      expect(r.renderWhere([{ column: 'a', operator: 'lt', value: 1 }]).sql).toContain('<');
      expect(r.renderWhere([{ column: 'a', operator: 'gte', value: 1 }]).sql).toContain('>=');
      expect(r.renderWhere([{ column: 'a', operator: 'lte', value: 1 }]).sql).toContain('<=');
    });
    it('contains uses STRPOS with raw value (no wildcard smuggling)', () => {
      const out = r.renderWhere([{ column: 'a', operator: 'contains', value: 'foo' }]);
      expect(out.sql).toBe('\nWHERE STRPOS(`a`, @p0) > 0');
      expect(out.params).toEqual([{ name: 'p0', value: 'foo' }]);
    });
    it('not_contains', () => {
      const out = r.renderWhere([{ column: 'a', operator: 'not_contains', value: 'X' }]);
      expect(out.sql).toBe('\nWHERE STRPOS(`a`, @p0) = 0');
      expect(out.params).toEqual([{ name: 'p0', value: 'X' }]);
    });
    it('starts_with / ends_with use BigQuery built-ins with raw values', () => {
      const sw = r.renderWhere([{ column: 'a', operator: 'starts_with', value: 'X' }]);
      expect(sw.sql).toBe('\nWHERE STARTS_WITH(`a`, @p0)');
      expect(sw.params).toEqual([{ name: 'p0', value: 'X' }]);
      const ew = r.renderWhere([{ column: 'a', operator: 'ends_with', value: 'X' }]);
      expect(ew.sql).toBe('\nWHERE ENDS_WITH(`a`, @p0)');
      expect(ew.params).toEqual([{ name: 'p0', value: 'X' }]);
    });
    it('substring matchers do not interpret % or _ as wildcards', () => {
      // With LIKE these would have matched anything; with STRPOS they only
      // match the exact substring.
      const c = r.renderWhere([{ column: 'a', operator: 'contains', value: '100%' }]);
      expect(c.params).toEqual([{ name: 'p0', value: '100%' }]);
      const sw = r.renderWhere([{ column: 'a', operator: 'starts_with', value: 'a_b' }]);
      expect(sw.params).toEqual([{ name: 'p0', value: 'a_b' }]);
    });
    it('regex / not_regex use REGEXP_CONTAINS', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'regex', value: '^x' }]).sql).toBe(
        '\nWHERE REGEXP_CONTAINS(`a`, @p0)'
      );
      expect(r.renderWhere([{ column: 'a', operator: 'not_regex', value: '^x' }]).sql).toBe(
        '\nWHERE NOT REGEXP_CONTAINS(`a`, @p0)'
      );
    });
  });

  describe('no-value operators', () => {
    it('is_empty (string-aware)', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'is_empty' }]).sql).toBe(
        "\nWHERE (`a` IS NULL OR `a` = '')"
      );
    });
    it('is_not_empty', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'is_not_empty' }]).sql).toBe(
        "\nWHERE (`a` IS NOT NULL AND `a` != '')"
      );
    });
    it('is_true / is_false', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'is_true' }]).sql).toBe('\nWHERE `a` = TRUE');
      expect(r.renderWhere([{ column: 'a', operator: 'is_false' }]).sql).toBe(
        '\nWHERE `a` = FALSE'
      );
    });
    it('is_null / is_not_null render unambiguous NULL checks (safe for any column type)', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'is_null' }]).sql).toBe('\nWHERE `a` IS NULL');
      expect(r.renderWhere([{ column: 'a', operator: 'is_not_null' }]).sql).toBe(
        '\nWHERE `a` IS NOT NULL'
      );
    });
  });

  describe('between', () => {
    it('renders BETWEEN with two params', () => {
      const out = r.renderWhere([
        { column: 'amount', operator: 'between', value: { from: 1, to: 100 } },
      ]);
      expect(out.sql).toBe('\nWHERE `amount` BETWEEN @p0 AND @p1');
      expect(out.params).toEqual([
        { name: 'p0', value: 1 },
        { name: 'p1', value: 100 },
      ]);
    });
    it('between followed by another rule advances param index correctly', () => {
      const out = r.renderWhere([
        { column: 'amount', operator: 'between', value: { from: 1, to: 100 } },
        { column: 'name', operator: 'eq', value: 'X' },
      ]);
      expect(out.sql).toBe('\nWHERE `amount` BETWEEN @p0 AND @p1\n  AND `name` = @p2');
      expect(out.params).toEqual([
        { name: 'p0', value: 1 },
        { name: 'p1', value: 100 },
        { name: 'p2', value: 'X' },
      ]);
    });
  });

  describe('relative_date', () => {
    it('today', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'today' } }]).sql
      ).toBe('\nWHERE `d` = CURRENT_DATE()');
    });
    it('yesterday', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'yesterday' } }])
          .sql
      ).toBe('\nWHERE `d` = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)');
    });
    it('last_n_days has an upper bound', () => {
      expect(
        r.renderWhere([
          { column: 'd', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } },
        ]).sql
      ).toBe('\nWHERE `d` >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND `d` <= CURRENT_DATE()');
    });
    it('last_n_months has an upper bound', () => {
      expect(
        r.renderWhere([
          { column: 'd', operator: 'relative_date', value: { kind: 'last_n_months', n: 3 } },
        ]).sql
      ).toBe('\nWHERE `d` >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH) AND `d` <= CURRENT_DATE()');
    });
    it('this_month', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'this_month' } }])
          .sql
      ).toBe(
        '\nWHERE `d` >= DATE_TRUNC(CURRENT_DATE(), MONTH) AND `d` < DATE_ADD(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH)'
      );
    });
    it('last_month', () => {
      const sql = r.renderWhere([
        { column: 'd', operator: 'relative_date', value: { kind: 'last_month' } },
      ]).sql;
      expect(sql).toContain('DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH)');
      expect(sql).toContain('DATE_TRUNC(CURRENT_DATE(), MONTH)');
    });
    it('this_year', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'this_year' } }])
          .sql
      ).toBe(
        '\nWHERE `d` >= DATE_TRUNC(CURRENT_DATE(), YEAR) AND `d` < DATE_ADD(DATE_TRUNC(CURRENT_DATE(), YEAR), INTERVAL 1 YEAR)'
      );
    });

    // Regression: `timestamp_col = CURRENT_DATE()` is a type error in BigQuery (no
    // TIMESTAMP↔DATE coercion). For sub-day columns the date part is compared so the
    // whole day matches and the DATE-typed bounds are type-compatible.
    describe('sub-day column types compare the DATE part', () => {
      const withType = (type: string) => () => type;

      it.each(['TIMESTAMP', 'DATETIME', 'TIMESTAMP WITH TIME ZONE'])(
        'wraps a %s column in DATE() for today (equality stays correct)',
        type => {
          expect(
            r.renderWhere(
              [{ column: 'd', operator: 'relative_date', value: { kind: 'today' } }],
              undefined,
              'p',
              withType(type)
            ).sql
          ).toBe('\nWHERE DATE(`d`) = CURRENT_DATE()');
        }
      );

      it('wraps both bounds in DATE() for last_n_days on a TIMESTAMP column', () => {
        expect(
          r.renderWhere(
            [{ column: 'd', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } }],
            undefined,
            'p',
            withType('TIMESTAMP')
          ).sql
        ).toBe(
          '\nWHERE DATE(`d`) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND DATE(`d`) <= CURRENT_DATE()'
        );
      });

      it('wraps both bounds of last_month for a TIMESTAMP column', () => {
        const sql = r.renderWhere(
          [{ column: 'd', operator: 'relative_date', value: { kind: 'last_month' } }],
          undefined,
          'p',
          withType('TIMESTAMP')
        ).sql;
        expect(sql).toContain('DATE(`d`) >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)');
        expect(sql).toContain('DATE(`d`) < DATE_TRUNC(CURRENT_DATE(), MONTH)');
      });

      it('wraps both bounds of this_month for a TIMESTAMP column', () => {
        const sql = r.renderWhere(
          [{ column: 'd', operator: 'relative_date', value: { kind: 'this_month' } }],
          undefined,
          'p',
          withType('TIMESTAMP')
        ).sql;
        expect(sql).toContain('DATE(`d`) >= DATE_TRUNC(CURRENT_DATE(), MONTH)');
        expect(sql).toContain(
          'DATE(`d`) < DATE_ADD(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH)'
        );
      });

      it('wraps both bounds of this_year for a TIMESTAMP column', () => {
        const sql = r.renderWhere(
          [{ column: 'd', operator: 'relative_date', value: { kind: 'this_year' } }],
          undefined,
          'p',
          withType('TIMESTAMP')
        ).sql;
        expect(sql).toContain('DATE(`d`) >= DATE_TRUNC(CURRENT_DATE(), YEAR)');
        expect(sql).toContain(
          'DATE(`d`) < DATE_ADD(DATE_TRUNC(CURRENT_DATE(), YEAR), INTERVAL 1 YEAR)'
        );
      });

      it('does NOT wrap a DATE column (compares directly)', () => {
        expect(
          r.renderWhere(
            [{ column: 'd', operator: 'relative_date', value: { kind: 'today' } }],
            undefined,
            'p',
            withType('DATE')
          ).sql
        ).toBe('\nWHERE `d` = CURRENT_DATE()');
      });
    });
  });

  // Regression: BigQuery infers a param's type from its JS value, so a date filter
  // binds as STRING and `date_col = @p` raises a type error. Date/time columns wrap
  // the placeholder in CAST(@p AS <type>) so the string is parsed to the column type.
  describe('date/time value placeholders are CAST', () => {
    const withType = (type: string) => () => type;

    it('wraps eq on a DATE column', () => {
      expect(
        r.renderWhere(
          [{ column: 'd', operator: 'eq', value: '2024-01-01' }],
          undefined,
          'p',
          withType('DATE')
        ).sql
      ).toBe('\nWHERE `d` = CAST(@p0 AS DATE)');
    });

    it.each(['DATETIME', 'TIME', 'TIMESTAMP'])('wraps gte on a %s column', type => {
      expect(
        r.renderWhere(
          [{ column: 'd', operator: 'gte', value: 'v' }],
          undefined,
          'p',
          withType(type)
        ).sql
      ).toBe(`\nWHERE \`d\` >= CAST(@p0 AS ${type})`);
    });

    it('wraps both bounds of between on a TIMESTAMP column', () => {
      expect(
        r.renderWhere(
          [{ column: 'd', operator: 'between', value: { from: 'a', to: 'b' } }],
          undefined,
          'p',
          withType('TIMESTAMP')
        ).sql
      ).toBe('\nWHERE `d` BETWEEN CAST(@p0 AS TIMESTAMP) AND CAST(@p1 AS TIMESTAMP)');
    });

    it('does NOT cast a non-date column (STRING)', () => {
      expect(
        r.renderWhere(
          [{ column: 'name', operator: 'eq', value: 'x' }],
          undefined,
          'p',
          withType('STRING')
        ).sql
      ).toBe('\nWHERE `name` = @p0');
    });
  });

  it('quotes dotted identifiers correctly', () => {
    const out = r.renderWhere([{ column: 'project.dataset.col', operator: 'eq', value: 1 }]);
    expect(out.sql).toBe('\nWHERE `project`.`dataset`.`col` = @p0');
  });

  describe('column qualification', () => {
    const qualify: ColumnRefResolver = column => `main.\`${column}\``;

    it('honours the resolver in scalar operators', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'eq', value: 1 }], qualify).sql).toBe(
        '\nWHERE main.`a` = @p0'
      );
      expect(
        r.renderWhere([{ column: 'a', operator: 'between', value: { from: 1, to: 2 } }], qualify)
          .sql
      ).toBe('\nWHERE main.`a` BETWEEN @p0 AND @p1');
    });

    it('honours the resolver in substring/regex operators', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'contains', value: 'x' }], qualify).sql).toBe(
        '\nWHERE STRPOS(main.`a`, @p0) > 0'
      );
      expect(
        r.renderWhere([{ column: 'a', operator: 'starts_with', value: 'x' }], qualify).sql
      ).toBe('\nWHERE STARTS_WITH(main.`a`, @p0)');
      expect(r.renderWhere([{ column: 'a', operator: 'regex', value: '^x' }], qualify).sql).toBe(
        '\nWHERE REGEXP_CONTAINS(main.`a`, @p0)'
      );
    });

    it('honours the resolver in no-value operators', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'is_null' }], qualify).sql).toBe(
        '\nWHERE main.`a` IS NULL'
      );
      expect(r.renderWhere([{ column: 'a', operator: 'is_empty' }], qualify).sql).toBe(
        "\nWHERE (main.`a` IS NULL OR main.`a` = '')"
      );
    });

    it('honours the resolver in relative_date presets', () => {
      expect(
        r.renderWhere(
          [{ column: 'd', operator: 'relative_date', value: { kind: 'today' } }],
          qualify
        ).sql
      ).toBe('\nWHERE main.`d` = CURRENT_DATE()');
    });

    it('honours the resolver on both column references in last_month', () => {
      const sql = r.renderWhere(
        [{ column: 'd', operator: 'relative_date', value: { kind: 'last_month' } }],
        qualify
      ).sql;
      expect(sql).toContain(
        'main.`d` >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH)'
      );
      expect(sql).toContain('main.`d` < DATE_TRUNC(CURRENT_DATE(), MONTH)');
      expect(sql).not.toMatch(/\s`d`\s</);
    });

    it('honours the resolver in ORDER BY', () => {
      expect(r.renderOrderBy([{ column: 'a', direction: 'asc' }], qualify).sql).toBe(
        '\nORDER BY\n  main.`a` ASC'
      );
    });

    it('routes different columns to different CTE prefixes', () => {
      const routed: ColumnRefResolver = column =>
        column === 'b' ? `orders.\`${column}\`` : `main.\`${column}\``;
      expect(
        r.renderWhere(
          [
            { column: 'a', operator: 'eq', value: 1 },
            { column: 'b', operator: 'gt', value: 2 },
          ],
          routed
        ).sql
      ).toBe('\nWHERE main.`a` = @p0\n  AND orders.`b` > @p1');
    });
  });

  describe('paramPrefix', () => {
    it('uses default param prefix `p` when none given', () => {
      const out = r.renderWhere([{ column: 'x', operator: 'eq', value: 1 }]);
      expect(out.sql).toContain('@p0');
      expect(out.params[0].name).toBe('p0');
    });

    it('uses custom paramPrefix when given', () => {
      const out = r.renderWhere([{ column: 'x', operator: 'eq', value: 1 }], undefined, 's_users_');
      expect(out.sql).toContain('@s_users_0');
      expect(out.params[0].name).toBe('s_users_0');
    });

    it('keeps param naming sequential across multiple filters with custom prefix', () => {
      const out = r.renderWhere(
        [
          { column: 'x', operator: 'eq', value: 1 },
          { column: 'y', operator: 'between', value: { from: 1, to: 2 } },
        ],
        undefined,
        's_users_'
      );
      expect(out.params.map(p => p.name)).toEqual(['s_users_0', 's_users_1', 's_users_2']);
    });
  });

  describe('HAVING (post-aggregation filters)', () => {
    it('renders a HAVING comparison on the aggregate EXPRESSION (not the output alias)', () => {
      const out = r.renderHaving([
        { column: 'amount', function: 'SUM', operator: 'gt', value: 1000 },
      ]);
      expect(out.sql).toBe('\nHAVING SUM(`amount`) > @h0');
      expect(out.params).toEqual([{ name: 'h0', value: 1000 }]);
    });

    it('uses COUNT(DISTINCT ...) for a COUNT_DISTINCT HAVING rule', () => {
      const out = r.renderHaving([
        { column: 'id', function: 'COUNT_DISTINCT', operator: 'gte', value: 5 },
      ]);
      expect(out.sql).toBe('\nHAVING COUNT(DISTINCT `id`) >= @h0');
    });

    it('joins multiple HAVING rules with AND, each on its own line', () => {
      const out = r.renderHaving([
        { column: 'amount', function: 'SUM', operator: 'gt', value: 100 },
        { column: 'amount', function: 'AVG', operator: 'lt', value: 50 },
      ]);
      expect(out.sql).toBe('\nHAVING SUM(`amount`) > @h0\n  AND AVG(`amount`) < @h1');
      expect(out.params.map(p => p.name)).toEqual(['h0', 'h1']);
    });

    it('qualifies the aggregate argument via the resolver (matches the SELECT)', () => {
      const qualify: ColumnRefResolver = column => `main.\`${column}\``;
      expect(
        r.renderHaving([{ column: 'amount', function: 'SUM', operator: 'gt', value: 1 }], qualify)
          .sql
      ).toBe('\nHAVING SUM(main.`amount`) > @h0');
    });

    it('renderHaving takes ONLY function rules; renderWhere skips them (mixed list)', () => {
      expect(
        r.renderHaving([
          { column: 'country', operator: 'eq', value: 'US' },
          { column: 'amount', function: 'SUM', operator: 'gt', value: 100 },
        ]).sql
      ).toBe('\nHAVING SUM(`amount`) > @h0');
      expect(
        r.renderWhere([
          { column: 'country', operator: 'eq', value: 'US' },
          { column: 'amount', function: 'SUM', operator: 'gt', value: 100 },
        ]).sql
      ).toBe('\nWHERE `country` = @p0');
    });

    it('returns empty SQL when no rule carries a function', () => {
      expect(r.renderHaving([{ column: 'a', operator: 'eq', value: 1 }]).sql).toBe('');
    });
  });
});
