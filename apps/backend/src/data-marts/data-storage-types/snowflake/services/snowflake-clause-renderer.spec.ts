import { SnowflakeClauseRenderer } from './snowflake-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';

function where(renderer: SnowflakeClauseRenderer, rule: FilterRule, type?: string) {
  return renderer.renderWhere([rule], undefined, 'p', type ? () => type : undefined).sql;
}

describe('SnowflakeClauseRenderer', () => {
  const r = new SnowflakeClauseRenderer();

  it('renders comparison operators with inlined literals and no params', () => {
    const out = r.renderWhere([{ column: 'age', operator: 'gte', value: 18 }]);
    expect(out.sql).toBe('\nWHERE "age" >= 18');
    expect(out.params).toEqual([]);
  });

  it('escapes single quotes AND backslashes in string literals (Snowflake treats \\ as escape)', () => {
    expect(where(r, { column: 'name', operator: 'eq', value: "O'Brien" })).toBe(
      `\nWHERE "name" = 'O''Brien'`
    );
    expect(where(r, { column: 'path', operator: 'eq', value: 'a\\b' })).toBe(
      `\nWHERE "path" = 'a\\\\b'`
    );
  });

  it('uses string built-ins (not LIKE) so %/_ stay literal', () => {
    expect(where(r, { column: 'name', operator: 'contains', value: '50%_x' })).toBe(
      `\nWHERE CONTAINS("name", '50%_x')`
    );
    expect(where(r, { column: 'name', operator: 'starts_with', value: 'a' })).toBe(
      `\nWHERE STARTSWITH("name", 'a')`
    );
    expect(where(r, { column: 'name', operator: 'ends_with', value: 'z' })).toBe(
      `\nWHERE ENDSWITH("name", 'z')`
    );
    expect(where(r, { column: 'name', operator: 'not_contains', value: 'x' })).toBe(
      `\nWHERE ("name" IS NULL OR NOT CONTAINS("name", 'x'))`
    );
    expect(where(r, { column: 'name', operator: 'regex', value: '^a.*' })).toBe(
      `\nWHERE REGEXP_INSTR("name", '^a.*') > 0`
    );
    expect(where(r, { column: 'name', operator: 'not_regex', value: '^a.*' })).toBe(
      `\nWHERE ("name" IS NULL OR REGEXP_INSTR("name", '^a.*') = 0)`
    );
    // `^alp` is the semantically meaningful case: Snowflake RLIKE/REGEXP_LIKE would
    // full-anchor it and NOT match `alpha`; REGEXP_INSTR>0 is partial (live-verified).
    expect(where(r, { column: 'name', operator: 'regex', value: '^alp' })).toBe(
      `\nWHERE REGEXP_INSTR("name", '^alp') > 0`
    );
  });

  it('inlines a malicious filter VALUE as a single escaped literal (no breakout)', () => {
    // Option B inlines every value, so the value is an injection surface too — both the
    // `lit` path (eq) and the `text` path (contains) must neutralize it.
    expect(where(r, { column: 'name', operator: 'eq', value: "x' OR '1'='1" })).toBe(
      `\nWHERE "name" = 'x'' OR ''1''=''1'`
    );
    expect(where(r, { column: 'name', operator: 'contains', value: "a') OR 1=1 --" })).toBe(
      `\nWHERE CONTAINS("name", 'a'') OR 1=1 --')`
    );
  });

  it('wraps date/time value comparisons in a defensive CAST to the column type', () => {
    expect(
      where(r, { column: 'created_at', operator: 'gte', value: '2024-01-01' }, 'TIMESTAMP')
    ).toBe(`\nWHERE "created_at" >= CAST('2024-01-01' AS TIMESTAMP)`);
    expect(
      where(
        r,
        { column: 'd', operator: 'between', value: { from: '2024-01-01', to: '2024-02-01' } },
        'DATE'
      )
    ).toBe(`\nWHERE "d" BETWEEN CAST('2024-01-01' AS DATE) AND CAST('2024-02-01' AS DATE)`);
    expect(where(r, { column: 't', operator: 'gte', value: '08:00:00' }, 'TIME')).toBe(
      `\nWHERE "t" >= CAST('08:00:00' AS TIME)`
    );
    expect(where(r, { column: 'age', operator: 'gte', value: 18 }, 'INTEGER')).toBe(
      `\nWHERE "age" >= 18`
    );
  });

  it('renders bool / null / empty operators', () => {
    expect(where(r, { column: 'ok', operator: 'is_true' })).toBe(`\nWHERE "ok" = TRUE`);
    expect(where(r, { column: 'ok', operator: 'is_false' })).toBe(`\nWHERE "ok" = FALSE`);
    expect(where(r, { column: 'x', operator: 'is_null' })).toBe(`\nWHERE "x" IS NULL`);
    expect(where(r, { column: 'x', operator: 'is_not_null' })).toBe(`\nWHERE "x" IS NOT NULL`);
    expect(where(r, { column: 's', operator: 'is_empty' })).toBe(
      `\nWHERE ("s" IS NULL OR "s" = '')`
    );
    expect(where(r, { column: 's', operator: 'is_not_empty' })).toBe(
      `\nWHERE ("s" IS NOT NULL AND "s" <> '')`
    );
    expect(where(r, { column: 'n', operator: 'neq', value: 1 })).toBe(
      `\nWHERE ("n" IS NULL OR "n" <> 1)`
    );
  });

  it('renders relative_date presets as half-open ranges with upper bounds', () => {
    expect(where(r, { column: 'd', operator: 'relative_date', value: { kind: 'today' } })).toBe(
      `\nWHERE "d" >= CURRENT_DATE AND "d" < DATEADD(day, 1, CURRENT_DATE)`
    );
    expect(
      where(r, { column: 'd', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } })
    ).toBe(`\nWHERE "d" >= DATEADD(day, -7, CURRENT_DATE) AND "d" < DATEADD(day, 1, CURRENT_DATE)`);
    expect(
      where(r, { column: 'd', operator: 'relative_date', value: { kind: 'this_month' } })
    ).toBe(
      `\nWHERE "d" >= DATE_TRUNC('month', CURRENT_DATE) AND "d" < DATEADD(month, 1, DATE_TRUNC('month', CURRENT_DATE))`
    );
    expect(where(r, { column: 'd', operator: 'relative_date', value: { kind: 'yesterday' } })).toBe(
      `\nWHERE "d" >= DATEADD(day, -1, CURRENT_DATE) AND "d" < CURRENT_DATE`
    );
    expect(
      where(r, { column: 'd', operator: 'relative_date', value: { kind: 'last_n_months', n: 3 } })
    ).toBe(
      `\nWHERE "d" >= DATEADD(month, -3, CURRENT_DATE) AND "d" < DATEADD(day, 1, CURRENT_DATE)`
    );
    expect(
      where(r, { column: 'd', operator: 'relative_date', value: { kind: 'last_month' } })
    ).toBe(
      `\nWHERE "d" >= DATE_TRUNC('month', DATEADD(month, -1, CURRENT_DATE)) AND "d" < DATE_TRUNC('month', CURRENT_DATE)`
    );
    expect(where(r, { column: 'd', operator: 'relative_date', value: { kind: 'this_year' } })).toBe(
      `\nWHERE "d" >= DATE_TRUNC('year', CURRENT_DATE) AND "d" < DATEADD(year, 1, DATE_TRUNC('year', CURRENT_DATE))`
    );
  });

  it('safely quotes malicious column names (no breakout via dots or payloads)', () => {
    // A 4+-part / payload-laden column name must stay fully inside quoted identifiers and
    // never break out of the WHERE clause. escapeSnowflakeIdentifier returns 4+-part names
    // RAW; this renderer uses the robust shared escaper instead.
    expect(where(r, { column: 'a.b.c.d OR 1=1 --', operator: 'is_null' })).toBe(
      `\nWHERE "a"."b"."c"."d OR 1=1 --" IS NULL`
    );
    expect(where(r, { column: `c'; DROP TABLE x; --`, operator: 'is_null' })).toBe(
      `\nWHERE "c'; DROP TABLE x; --" IS NULL`
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
