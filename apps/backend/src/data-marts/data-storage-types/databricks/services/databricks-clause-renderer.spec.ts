import { DatabricksClauseRenderer } from './databricks-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';

function where(renderer: DatabricksClauseRenderer, rule: FilterRule, type?: string) {
  return renderer.renderWhere([rule], undefined, 'p', type ? () => type : undefined).sql;
}

describe('DatabricksClauseRenderer', () => {
  const r = new DatabricksClauseRenderer();

  it('renders comparison operators with inlined literals and no params', () => {
    const out = r.renderWhere([{ column: 'age', operator: 'gte', value: 18 }]);
    expect(out.sql).toBe('\nWHERE `age` >= 18');
    expect(out.params).toEqual([]);
    expect(where(r, { column: 'age', operator: 'gt', value: 18 })).toBe('\nWHERE `age` > 18');
    expect(where(r, { column: 'age', operator: 'lt', value: 18 })).toBe('\nWHERE `age` < 18');
    expect(where(r, { column: 'age', operator: 'lte', value: 18 })).toBe('\nWHERE `age` <= 18');
  });

  it('renders IN / NOT IN with inlined escaped literals and no params', () => {
    const out = r.renderWhere([{ column: 'channel', operator: 'in', value: ['fb', "O'Brien", 5] }]);
    expect(out.sql).toBe("\nWHERE `channel` IN ('fb', 'O''Brien', 5)");
    expect(out.params).toEqual([]);
    expect(where(r, { column: 'channel', operator: 'not_in', value: ['fb', 'google'] })).toBe(
      "\nWHERE `channel` NOT IN ('fb', 'google')"
    );
  });

  it('safely escapes malicious column names (no breakout via dots or payloads)', () => {
    // The column name is user-controlled (FilterRule.column is only z.string().min(1)); it
    // must stay fully inside backtick-quoted identifiers and never break out of the clause.
    expect(where(r, { column: 'a.b.c.d OR 1=1 --', operator: 'is_null' })).toBe(
      '\nWHERE `a`.`b`.`c`.`d OR 1=1 --` IS NULL'
    );
    expect(where(r, { column: "c'; DROP TABLE x; --", operator: 'is_null' })).toBe(
      "\nWHERE `c'; DROP TABLE x; --` IS NULL"
    );
  });

  it('escapes single quotes AND backslashes (Spark treats \\ as an escape char)', () => {
    expect(where(r, { column: 'name', operator: 'eq', value: "O'Brien" })).toBe(
      "\nWHERE `name` = 'O''Brien'"
    );
    expect(where(r, { column: 'path', operator: 'eq', value: 'a\\b' })).toBe(
      "\nWHERE `path` = 'a\\\\b'"
    );
  });

  it('inlines a malicious filter VALUE as a single escaped literal (no breakout)', () => {
    expect(where(r, { column: 'name', operator: 'eq', value: "x' OR '1'='1" })).toBe(
      "\nWHERE `name` = 'x'' OR ''1''=''1'"
    );
  });

  it('uses Spark string built-ins (not LIKE) so %/_ stay literal', () => {
    expect(where(r, { column: 'name', operator: 'contains', value: '50%_x' })).toBe(
      "\nWHERE contains(`name`, '50%_x')"
    );
    expect(where(r, { column: 'name', operator: 'starts_with', value: 'a' })).toBe(
      "\nWHERE startswith(`name`, 'a')"
    );
    expect(where(r, { column: 'name', operator: 'ends_with', value: 'z' })).toBe(
      "\nWHERE endswith(`name`, 'z')"
    );
    expect(where(r, { column: 'name', operator: 'not_contains', value: 'x' })).toBe(
      "\nWHERE NOT contains(`name`, 'x')"
    );
    expect(where(r, { column: 'name', operator: 'regex', value: '^a.*' })).toBe(
      "\nWHERE `name` RLIKE '^a.*'"
    );
    expect(where(r, { column: 'name', operator: 'not_regex', value: '^a.*' })).toBe(
      "\nWHERE NOT (`name` RLIKE '^a.*')"
    );
    // A regex metacharacter survives the string-literal layer: the backslash is doubled so
    // Spark unescapes it back to `\d` for RLIKE (live-verified — matched the digit row).
    expect(where(r, { column: 'name', operator: 'regex', value: '\\d+' })).toBe(
      "\nWHERE `name` RLIKE '\\\\d+'"
    );
  });

  it('wraps date/time value comparisons in a defensive CAST to the column type', () => {
    expect(
      where(r, { column: 'created_at', operator: 'gte', value: '2024-01-01' }, 'TIMESTAMP')
    ).toBe("\nWHERE `created_at` >= CAST('2024-01-01' AS TIMESTAMP)");
    expect(where(r, { column: 'ts', operator: 'eq', value: '2024-01-01' }, 'TIMESTAMP_NTZ')).toBe(
      "\nWHERE `ts` = CAST('2024-01-01' AS TIMESTAMP_NTZ)"
    );
    expect(
      where(
        r,
        { column: 'd', operator: 'between', value: { from: '2024-01-01', to: '2024-02-01' } },
        'DATE'
      )
    ).toBe("\nWHERE `d` BETWEEN CAST('2024-01-01' AS DATE) AND CAST('2024-02-01' AS DATE)");
    // Non-date columns get no cast.
    expect(where(r, { column: 'age', operator: 'gte', value: 18 }, 'INT')).toBe(
      '\nWHERE `age` >= 18'
    );
  });

  it('renders bool / null / empty operators', () => {
    expect(where(r, { column: 'ok', operator: 'is_true' })).toBe('\nWHERE `ok` = TRUE');
    expect(where(r, { column: 'ok', operator: 'is_false' })).toBe('\nWHERE `ok` = FALSE');
    expect(where(r, { column: 'x', operator: 'is_null' })).toBe('\nWHERE `x` IS NULL');
    expect(where(r, { column: 'x', operator: 'is_not_null' })).toBe('\nWHERE `x` IS NOT NULL');
    expect(where(r, { column: 's', operator: 'is_empty' })).toBe(
      "\nWHERE (`s` IS NULL OR `s` = '')"
    );
    expect(where(r, { column: 's', operator: 'is_not_empty' })).toBe(
      "\nWHERE (`s` IS NOT NULL AND `s` <> '')"
    );
    expect(where(r, { column: 'n', operator: 'neq', value: 1 })).toBe('\nWHERE `n` <> 1');
  });

  it('renders the week/quarter/next_n_days presets (Monday-fixed trunc WEEK)', () => {
    expect(
      where(r, { column: 'd', operator: 'relative_date', value: { kind: 'next_n_days', n: 7 } })
    ).toBe('\nWHERE `d` >= CURRENT_DATE AND `d` < date_add(CURRENT_DATE, 8)');
    expect(where(r, { column: 'd', operator: 'relative_date', value: { kind: 'this_week' } })).toBe(
      "\nWHERE `d` >= trunc(CURRENT_DATE, 'WEEK') AND `d` < date_add(trunc(CURRENT_DATE, 'WEEK'), 7)"
    );
    expect(where(r, { column: 'd', operator: 'relative_date', value: { kind: 'last_week' } })).toBe(
      "\nWHERE `d` >= date_add(trunc(CURRENT_DATE, 'WEEK'), -7) AND `d` < trunc(CURRENT_DATE, 'WEEK')"
    );
    expect(
      where(r, { column: 'd', operator: 'relative_date', value: { kind: 'this_quarter' } })
    ).toBe(
      "\nWHERE `d` >= trunc(CURRENT_DATE, 'QUARTER') AND `d` < add_months(trunc(CURRENT_DATE, 'QUARTER'), 3)"
    );
    expect(
      where(r, { column: 'd', operator: 'relative_date', value: { kind: 'last_quarter' } })
    ).toBe(
      "\nWHERE `d` >= add_months(trunc(CURRENT_DATE, 'QUARTER'), -3) AND `d` < trunc(CURRENT_DATE, 'QUARTER')"
    );
  });

  it('renders relative_date presets as half-open ranges with upper bounds', () => {
    expect(where(r, { column: 'd', operator: 'relative_date', value: { kind: 'today' } })).toBe(
      '\nWHERE `d` >= CURRENT_DATE AND `d` < date_add(CURRENT_DATE, 1)'
    );
    expect(where(r, { column: 'd', operator: 'relative_date', value: { kind: 'yesterday' } })).toBe(
      '\nWHERE `d` >= date_add(CURRENT_DATE, -1) AND `d` < CURRENT_DATE'
    );
    expect(
      where(r, { column: 'd', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } })
    ).toBe('\nWHERE `d` >= date_add(CURRENT_DATE, -7) AND `d` < date_add(CURRENT_DATE, 1)');
    expect(
      where(r, { column: 'd', operator: 'relative_date', value: { kind: 'last_n_months', n: 3 } })
    ).toBe('\nWHERE `d` >= add_months(CURRENT_DATE, -3) AND `d` < date_add(CURRENT_DATE, 1)');
    expect(
      where(r, { column: 'd', operator: 'relative_date', value: { kind: 'this_month' } })
    ).toBe(
      "\nWHERE `d` >= trunc(CURRENT_DATE, 'MONTH') AND `d` < add_months(trunc(CURRENT_DATE, 'MONTH'), 1)"
    );
    expect(
      where(r, { column: 'd', operator: 'relative_date', value: { kind: 'last_month' } })
    ).toBe(
      "\nWHERE `d` >= add_months(trunc(CURRENT_DATE, 'MONTH'), -1) AND `d` < trunc(CURRENT_DATE, 'MONTH')"
    );
    expect(where(r, { column: 'd', operator: 'relative_date', value: { kind: 'this_year' } })).toBe(
      "\nWHERE `d` >= trunc(CURRENT_DATE, 'YEAR') AND `d` < add_months(trunc(CURRENT_DATE, 'YEAR'), 12)"
    );
  });

  it('rejects non-finite numbers and negative/non-integer relative_date n', () => {
    expect(() => r.renderWhere([{ column: 'x', operator: 'gt', value: Infinity }])).toThrow(
      /Non-finite/
    );
    expect(() =>
      r.renderWhere([
        {
          column: 'd',
          operator: 'relative_date',
          value: { kind: 'last_n_days', n: -1 },
        } as FilterRule,
      ])
    ).toThrow(/Invalid relative_date n/);
  });
});
