import { BigQueryClauseRenderer } from './bigquery-clause-renderer';
import { CalculatedFieldPlan, ColumnRefResolver } from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';

describe('BigQueryClauseRenderer', () => {
  const r = new BigQueryClauseRenderer();

  describe('scalar operators', () => {
    it('eq', () => {
      const out = r.renderWhere([{ column: 'name', operator: 'eq', value: 'X' }]);
      expect(out.sql).toBe('\nWHERE `name` = @p0');
      expect(out.params).toEqual([{ name: 'p0', value: 'X' }]);
    });
    it('neq is null-inclusive (keeps NULLs)', () => {
      const out = r.renderWhere([{ column: 'a', operator: 'neq', value: 1 }]);
      expect(out.sql).toBe('\nWHERE (`a` IS NULL OR `a` <> @p0)');
      expect(out.params).toEqual([{ name: 'p0', value: 1 }]);
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
    it('not_contains is null-inclusive', () => {
      const out = r.renderWhere([{ column: 'a', operator: 'not_contains', value: 'X' }]);
      expect(out.sql).toBe('\nWHERE (`a` IS NULL OR STRPOS(`a`, @p0) = 0)');
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
        '\nWHERE (`a` IS NULL OR NOT REGEXP_CONTAINS(`a`, @p0))'
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

  describe('in / not_in', () => {
    it('renders IN with one named param per value', () => {
      const out = r.renderWhere([{ column: 'channel', operator: 'in', value: ['fb', 'google'] }]);
      expect(out.sql).toBe('\nWHERE `channel` IN (@p0, @p1)');
      expect(out.params).toEqual([
        { name: 'p0', value: 'fb' },
        { name: 'p1', value: 'google' },
      ]);
    });
    it('renders NOT IN and advances the param index for the next rule', () => {
      const out = r.renderWhere([
        { column: 'channel', operator: 'not_in', value: ['fb', 'google', 'tiktok'] },
        { column: 'name', operator: 'eq', value: 'X' },
      ]);
      expect(out.sql).toBe(
        '\nWHERE (`channel` IS NULL OR `channel` NOT IN (@p0, @p1, @p2))\n  AND `name` = @p3'
      );
      expect(out.params).toEqual([
        { name: 'p0', value: 'fb' },
        { name: 'p1', value: 'google' },
        { name: 'p2', value: 'tiktok' },
        { name: 'p3', value: 'X' },
      ]);
    });
    it('casts each placeholder for a DATE column', () => {
      const out = r.renderWhere(
        [{ column: 'day', operator: 'in', value: ['2026-01-01', '2026-01-02'] }],
        undefined,
        'p',
        () => 'DATE'
      );
      expect(out.sql).toBe('\nWHERE `day` IN (CAST(@p0 AS DATE), CAST(@p1 AS DATE))');
      expect(out.params).toEqual([
        { name: 'p0', value: '2026-01-01' },
        { name: 'p1', value: '2026-01-02' },
      ]);
    });
  });

  describe('relative_date', () => {
    it('next_n_days includes today and n days ahead', () => {
      expect(
        r.renderWhere([
          { column: 'd', operator: 'relative_date', value: { kind: 'next_n_days', n: 7 } },
        ]).sql
      ).toBe('\nWHERE `d` >= CURRENT_DATE() AND `d` <= DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY)');
    });
    it('this_week / last_week truncate with ISOWEEK (Monday), not the Sunday-based WEEK', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'this_week' } }])
          .sql
      ).toBe(
        '\nWHERE `d` >= DATE_TRUNC(CURRENT_DATE(), ISOWEEK) AND `d` < DATE_ADD(DATE_TRUNC(CURRENT_DATE(), ISOWEEK), INTERVAL 7 DAY)'
      );
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'last_week' } }])
          .sql
      ).toBe(
        '\nWHERE `d` >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), ISOWEEK), INTERVAL 7 DAY) AND `d` < DATE_TRUNC(CURRENT_DATE(), ISOWEEK)'
      );
    });
    it('this_quarter / last_quarter are calendar quarters', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'this_quarter' } }])
          .sql
      ).toBe(
        '\nWHERE `d` >= DATE_TRUNC(CURRENT_DATE(), QUARTER) AND `d` < DATE_ADD(DATE_TRUNC(CURRENT_DATE(), QUARTER), INTERVAL 3 MONTH)'
      );
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'last_quarter' } }])
          .sql
      ).toBe(
        '\nWHERE `d` >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), QUARTER), INTERVAL 3 MONTH) AND `d` < DATE_TRUNC(CURRENT_DATE(), QUARTER)'
      );
    });
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

    it('wraps neq on a DATE column, null-inclusive', () => {
      expect(
        r.renderWhere(
          [{ column: 'd', operator: 'neq', value: '2024-01-01' }],
          undefined,
          'p',
          withType('DATE')
        ).sql
      ).toBe('\nWHERE (`d` IS NULL OR `d` <> CAST(@p0 AS DATE))');
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

  // BigQueryFieldType is the API vocabulary, not GoogleSQL: the live probe substituted a declared
  // FLOAT into a CAST and BigQuery answered `Type not found: FLOAT at [2:51]`.
  describe('castTypeForDeclaredType (declared BigQuery type → GoogleSQL cast target)', () => {
    it('maps every numeric declared type to the GoogleSQL name, FLOAT to FLOAT64', () => {
      expect(r.castTypeForDeclaredType('INTEGER')).toBe('INT64');
      expect(r.castTypeForDeclaredType('FLOAT')).toBe('FLOAT64');
      expect(r.castTypeForDeclaredType('NUMERIC')).toBe('NUMERIC');
      expect(r.castTypeForDeclaredType('BIGNUMERIC')).toBe('BIGNUMERIC');
    });

    it('reads a declared type case-insensitively and ignores padding', () => {
      expect(r.castTypeForDeclaredType(' float ')).toBe('FLOAT64');
    });

    it('answers undefined for a type no aggregation casts to, rather than guessing a spelling', () => {
      expect(r.castTypeForDeclaredType('STRING')).toBeUndefined();
      expect(r.castTypeForDeclaredType('DATE')).toBeUndefined();
      expect(r.castTypeForDeclaredType('TIMESTAMP')).toBeUndefined();
      expect(r.castTypeForDeclaredType('RECORD')).toBeUndefined();
    });
  });

  // This is one of the two dialects where the VALUE's JS type decides the outcome
  // today: the SDK infers a param's type from it, so `= 10` and `= '10'` over the SAME field flip
  // between `No matching signature for operator =` and the right answer. The placeholder now
  // carries the declaration, so one predicate is emitted for both and the driver infers nothing.
  describe('a Calculated Field comparison imposes the declared type', () => {
    const NUM_EXPR = 'CONCAT(`n_prefix`, `n_suffix`)';
    const numericText: CalculatedFieldPlan = {
      outputName: 'probe',
      formula: 'CONCAT({{ref field="n_prefix"}}, {{ref field="n_suffix"}})',
      level: 'column',
      type: 'FLOAT',
    };
    const whereFor = (
      declaredType: string,
      rule: FilterRule
    ): { sql: string; params: { name: string; value: unknown }[] } =>
      r.renderWhere(
        [rule],
        undefined,
        'p',
        () => declaredType,
        r.buildCalculatedPredicateExpressions([{ ...numericText, type: declaredType }])
      );

    // The declared FLOAT is the API vocabulary; GoogleSQL answers `Type not found: FLOAT`, so
    // both sides must be spelled FLOAT64 — the same mapping the aggregation path already uses.
    it('casts BOTH sides of `> 5` to the GoogleSQL name of the declared type', () => {
      expect(whereFor('FLOAT', { column: 'probe', operator: 'gt', value: 5 }).sql).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS FLOAT64) > CAST(@p0 AS FLOAT64)`
      );
    });

    // Measured: shapes 5a and 5b differ only in whether the rule's value is `10` or `'10'`,
    // and that alone flipped this dialect between BQ-E3 and the one correct row. One SQL text now
    // serves both, and the bound value travels as the analyst supplied it.
    it('emits ONE predicate whether the value arrives as 10 or as "10"', () => {
      const asNumber = whereFor('FLOAT', { column: 'probe', operator: 'eq', value: 10 });
      const asString = whereFor('FLOAT', { column: 'probe', operator: 'eq', value: '10' });

      expect(asNumber.sql).toBe(`\nWHERE CAST((${NUM_EXPR}) AS FLOAT64) = CAST(@p0 AS FLOAT64)`);
      expect(asString.sql).toBe(asNumber.sql);
      expect(asNumber.params).toEqual([{ name: 'p0', value: 10 }]);
      expect(asString.params).toEqual([{ name: 'p0', value: '10' }]);
    });

    // Every value slot, not just the scalar ones — `between` and the IN list build their own
    // placeholders and would each be a separate way to lose the declaration.
    it('reaches the BETWEEN bounds and every IN list member', () => {
      expect(
        whereFor('FLOAT', { column: 'probe', operator: 'between', value: { from: 1, to: 5 } }).sql
      ).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS FLOAT64) BETWEEN CAST(@p0 AS FLOAT64) AND ` +
          `CAST(@p1 AS FLOAT64)`
      );
      expect(whereFor('FLOAT', { column: 'probe', operator: 'in', value: [9, 10] }).sql).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS FLOAT64) IN (CAST(@p0 AS FLOAT64), CAST(@p1 AS FLOAT64))`
      );
    });

    // BigQuery is the dialect whose exact types must stay BARE — it rejects every parameterized
    // type in a CAST, so a `(38,18)` harmonised with the other four would be a hard query error.
    it('keeps NUMERIC unparameterized on both sides, which this dialect requires in a CAST', () => {
      expect(whereFor('NUMERIC', { column: 'probe', operator: 'gt', value: 5 }).sql).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS NUMERIC) > CAST(@p0 AS NUMERIC)`
      );
    });

    // `CAST(1.5 AS INT64)` rounds here and Spark's equivalent truncates, so casting an
    // integer declaration would make one report answer differently per warehouse.
    it('never casts an INTEGER declaration, though the mapping states INT64 for it', () => {
      expect(r.castTypeForDeclaredType('INTEGER')).toBe('INT64');
      expect(whereFor('INTEGER', { column: 'probe', operator: 'gt', value: 5 }).sql).toBe(
        `\nWHERE (${NUM_EXPR}) > @p0`
      );
    });

    // The no-op half: a declaration this dialect states no target for emits exactly the SQL it
    // emits today — including, deliberately, the one that raises.
    it('emits no cast for a declared type this dialect states no target for', () => {
      expect(whereFor('STRING', { column: 'probe', operator: 'gt', value: '5' }).sql).toBe(
        `\nWHERE (${NUM_EXPR}) > @p0`
      );
    });

    // A DATE declaration takes this dialect's DATE-placeholder cast — the one an ordinary DATE
    // column has always had and which a calculated field NEVER REACHED before, because the type
    // resolver answered `undefined` for it. It gains no NUMERIC target: dates ship
    // ranges as measured, and this dialect's answer to a mis-declared one is the loud BQ-E4.
    it('takes the DATE placeholder cast a calculated field never reached before', () => {
      expect(whereFor('DATE', { column: 'probe', operator: 'gte', value: '2026-07-01' }).sql).toBe(
        `\nWHERE (${NUM_EXPR}) >= CAST(@p0 AS DATE)`
      );
    });

    // `relative_date` is NOT in the comparison set: its bounds are `CURRENT_DATE()` arithmetic this
    // renderer inlines, so there is no bound value to impose a type on.
    //
    // It IS type-aware on this dialect alone, and the declaration reaching it is a FIX rather than
    // a side effect: BigQuery raises on `TIMESTAMP >= DATE`, which is why an ordinary sub-day
    // column is wrapped in `DATE(...)`. A TIMESTAMP-declared calculated field rendered BARE before
    // this slice and could only raise — and nothing anywhere pinned either shape.
    it('renders relative_date over the formula, wrapping only a sub-day declaration', () => {
      const relative = (declaredType: string, kind: 'today'): string =>
        whereFor(declaredType, {
          column: 'probe',
          operator: 'relative_date',
          value: { kind },
        }).sql;

      expect(relative('DATE', 'today')).toBe(`\nWHERE (${NUM_EXPR}) = CURRENT_DATE()`);
      expect(relative('TIMESTAMP', 'today')).toBe(`\nWHERE DATE((${NUM_EXPR})) = CURRENT_DATE()`);
      expect(relative('DATETIME', 'today')).toBe(`\nWHERE DATE((${NUM_EXPR})) = CURRENT_DATE()`);
    });

    // The imposition is a COMPARISON's, and the operator decides. Casting an `IS NULL` would
    // make ONE unparseable row fail the WHOLE query where it used to return rows — a new failure
    // mode, on a predicate that never reads a value — and a numeric target inside STRPOS buys
    // nothing at all.
    it('leaves IS NULL, IS NOT NULL and the text matchers uncast', () => {
      const uncast = (rule: FilterRule): string => whereFor('FLOAT', rule).sql;

      expect(uncast({ column: 'probe', operator: 'is_null' })).toBe(
        `\nWHERE (${NUM_EXPR}) IS NULL`
      );
      expect(uncast({ column: 'probe', operator: 'is_not_null' })).toBe(
        `\nWHERE (${NUM_EXPR}) IS NOT NULL`
      );
      expect(uncast({ column: 'probe', operator: 'contains', value: 'x' })).toBe(
        `\nWHERE STRPOS((${NUM_EXPR}), @p0) > 0`
      );
      expect(uncast({ column: 'probe', operator: 'starts_with', value: 'x' })).toBe(
        `\nWHERE STARTS_WITH((${NUM_EXPR}), @p0)`
      );
      expect(uncast({ column: 'probe', operator: 'is_empty' })).toBe(
        `\nWHERE ((${NUM_EXPR}) IS NULL OR (${NUM_EXPR}) = '')`
      );
    });

    // The imposition is scoped to a rule whose left-hand side IS a formula. An ordinary column
    // keeps the SQL it ships today, whatever its own type resolves to.
    it('leaves an ordinary column of the same declared type untouched on both sides', () => {
      expect(
        r.renderWhere(
          [{ column: 'amount', operator: 'gt', value: 5 }],
          undefined,
          'p',
          () => 'FLOAT',
          r.buildCalculatedPredicateExpressions([numericText])
        ).sql
      ).toBe('\nWHERE `amount` > @p0');
    });
  });
});
