import { BigQueryClauseRenderer } from './bigquery-clause-renderer';

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
      expect(out.sql).toBe('\nWHERE `amount` BETWEEN @p0 AND @p1 AND `name` = @p2');
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
    it('last_n_days', () => {
      expect(
        r.renderWhere([
          { column: 'd', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } },
        ]).sql
      ).toBe('\nWHERE `d` >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)');
    });
    it('last_n_months', () => {
      expect(
        r.renderWhere([
          { column: 'd', operator: 'relative_date', value: { kind: 'last_n_months', n: 3 } },
        ]).sql
      ).toBe('\nWHERE `d` >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)');
    });
    it('this_month', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'this_month' } }])
          .sql
      ).toBe('\nWHERE `d` >= DATE_TRUNC(CURRENT_DATE(), MONTH)');
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
      ).toBe('\nWHERE `d` >= DATE_TRUNC(CURRENT_DATE(), YEAR)');
    });
  });

  it('quotes dotted identifiers correctly', () => {
    const out = r.renderWhere([{ column: 'project.dataset.col', operator: 'eq', value: 1 }]);
    expect(out.sql).toBe('\nWHERE `project`.`dataset`.`col` = @p0');
  });
});
