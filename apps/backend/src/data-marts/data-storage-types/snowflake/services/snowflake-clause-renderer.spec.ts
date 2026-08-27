import { SnowflakeClauseRenderer } from './snowflake-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';
import { CalculatedFieldPlan } from '../../utils/sql-clause-renderer';

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

  it('renders IN / NOT IN with inlined escaped literals and no params', () => {
    const out = r.renderWhere([{ column: 'channel', operator: 'in', value: ['fb', "O'Brien", 5] }]);
    expect(out.sql).toBe(`\nWHERE "channel" IN ('fb', 'O''Brien', 5)`);
    expect(out.params).toEqual([]);
    expect(where(r, { column: 'channel', operator: 'not_in', value: ['fb', 'google'] })).toBe(
      `\nWHERE ("channel" IS NULL OR "channel" NOT IN ('fb', 'google'))`
    );
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

  it('is_blank / is_not_blank are type-aware: explicit-set TRIM on strings, NULL-only elsewhere', () => {
    // TRIM with the explicit set: Snowflake's one-argument TRIM strips only the blank
    // space, which would leave tab/newline-only cells "not blank" — unlike the docs promise.
    expect(where(r, { column: 's', operator: 'is_blank' }, 'VARCHAR')).toBe(
      `\nWHERE ("s" IS NULL OR TRIM("s", ' \\t\\n\\r') = '')`
    );
    expect(where(r, { column: 's', operator: 'is_not_blank' }, 'VARCHAR')).toBe(
      `\nWHERE ("s" IS NOT NULL AND TRIM("s", ' \\t\\n\\r') <> '')`
    );
    expect(where(r, { column: 'n', operator: 'is_blank' }, 'INTEGER')).toBe('\nWHERE "n" IS NULL');
    // Unknown column type: the NULL-only form is the one that is valid SQL on any type.
    expect(where(r, { column: 'x', operator: 'is_not_blank' })).toBe('\nWHERE "x" IS NOT NULL');
  });

  it('renders the week/quarter/next_n_days presets (ISO Monday weeks via DAYOFWEEKISO)', () => {
    expect(
      where(r, { column: 'd', operator: 'relative_date', value: { kind: 'next_n_days', n: 7 } })
    ).toBe('\nWHERE "d" >= CURRENT_DATE AND "d" < DATEADD(day, 8, CURRENT_DATE)');
    // DAYOFWEEKISO is session-parameter-independent — DATE_TRUNC('week') would follow WEEK_START.
    expect(where(r, { column: 'd', operator: 'relative_date', value: { kind: 'this_week' } })).toBe(
      '\nWHERE "d" >= DATEADD(day, 1 - DAYOFWEEKISO(CURRENT_DATE), CURRENT_DATE) AND "d" < DATEADD(day, 8 - DAYOFWEEKISO(CURRENT_DATE), CURRENT_DATE)'
    );
    expect(where(r, { column: 'd', operator: 'relative_date', value: { kind: 'last_week' } })).toBe(
      '\nWHERE "d" >= DATEADD(day, -6 - DAYOFWEEKISO(CURRENT_DATE), CURRENT_DATE) AND "d" < DATEADD(day, 1 - DAYOFWEEKISO(CURRENT_DATE), CURRENT_DATE)'
    );
    expect(
      where(r, { column: 'd', operator: 'relative_date', value: { kind: 'this_quarter' } })
    ).toBe(
      `\nWHERE "d" >= DATE_TRUNC('quarter', CURRENT_DATE) AND "d" < DATEADD(month, 3, DATE_TRUNC('quarter', CURRENT_DATE))`
    );
    expect(
      where(r, { column: 'd', operator: 'relative_date', value: { kind: 'last_quarter' } })
    ).toBe(
      `\nWHERE "d" >= DATEADD(month, -3, DATE_TRUNC('quarter', CURRENT_DATE)) AND "d" < DATE_TRUNC('quarter', CURRENT_DATE)`
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

  // Snowflake normalizes every numeric spelling to three declared types upstream
  // (parseSnowflakeFieldType), so this map has three entries — but NUMERIC still has to state its
  // scale: bare NUMBER is (38,0) here, and a cast to it truncates every fraction.
  describe('castTypeForDeclaredType (declared Snowflake type → cast target)', () => {
    it('maps every numeric declared type, giving the exact type an explicit scale', () => {
      expect(r.castTypeForDeclaredType('INTEGER')).toBe('INTEGER');
      expect(r.castTypeForDeclaredType('FLOAT')).toBe('FLOAT');
      expect(r.castTypeForDeclaredType('NUMERIC')).toBe('NUMERIC(38,18)');
    });

    it('reads a declared type case-insensitively and ignores padding', () => {
      expect(r.castTypeForDeclaredType(' float ')).toBe('FLOAT');
    });

    it('answers undefined for a type no aggregation casts to, rather than guessing a spelling', () => {
      expect(r.castTypeForDeclaredType('STRING')).toBeUndefined();
      expect(r.castTypeForDeclaredType('TIMESTAMP')).toBeUndefined();
      expect(r.castTypeForDeclaredType('VARIANT')).toBeUndefined();
    });
  });

  // This dialect already answered the probe's `> 5` correctly — it coerces the text
  // to a number — so the whole point here is the NO-OP: 10 live cells must not move. What changes
  // is that the declaration is now stated rather than inferred, which is what makes the same
  // formula answer identically on Redshift.
  describe('a Calculated Field comparison imposes the declared type', () => {
    const NUM_EXPR = 'CONCAT("n_prefix", "n_suffix")';
    const numericText: CalculatedFieldPlan = {
      outputName: 'probe',
      formula: 'CONCAT({{ref field="n_prefix"}}, {{ref field="n_suffix"}})',
      level: 'column',
      type: 'FLOAT',
    };
    const whereFor = (declaredType: string, rule: FilterRule): string =>
      r.renderWhere(
        [rule],
        undefined,
        'p',
        () => declaredType,
        r.buildCalculatedPredicateExpressions([{ ...numericText, type: declaredType }])
      ).sql;

    // FLOAT stays FLOAT: Snowflake's is already 64-bit, so there is no narrowing to avoid here.
    it('casts BOTH sides of `> 5` to the declared type', () => {
      expect(whereFor('FLOAT', { column: 'probe', operator: 'gt', value: 5 })).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS FLOAT) > CAST(5 AS FLOAT)`
      );
    });

    it('binds the literal under the declaration whether the value arrives as 10 or as "10"', () => {
      expect(whereFor('FLOAT', { column: 'probe', operator: 'eq', value: 10 })).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS FLOAT) = CAST(10 AS FLOAT)`
      );
      expect(whereFor('FLOAT', { column: 'probe', operator: 'eq', value: '10' })).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS FLOAT) = CAST('10' AS FLOAT)`
      );
    });

    // NUMERIC is a synonym of NUMBER, whose default is (38,0) — an unqualified target on either
    // side would truncate every fraction.
    it('spells the scale on a NUMERIC declaration, on the value as well as the expression', () => {
      expect(whereFor('NUMERIC', { column: 'probe', operator: 'gte', value: 1.5 })).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS NUMERIC(38,18)) >= CAST(1.5 AS NUMERIC(38,18))`
      );
    });

    it('reaches the BETWEEN bounds and every IN list member', () => {
      expect(
        whereFor('FLOAT', { column: 'probe', operator: 'between', value: { from: 1, to: 5 } })
      ).toBe(`\nWHERE CAST((${NUM_EXPR}) AS FLOAT) BETWEEN CAST(1 AS FLOAT) AND CAST(5 AS FLOAT)`);
      expect(whereFor('FLOAT', { column: 'probe', operator: 'in', value: [9, 10] })).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS FLOAT) IN (CAST(9 AS FLOAT), CAST(10 AS FLOAT))`
      );
    });

    // `CAST(x AS INTEGER)` resolves to NUMBER(38,0) here, so casting an integer declaration
    // would round every value the report compares.
    it('never casts an INTEGER declaration, though the mapping states a target for it', () => {
      expect(r.castTypeForDeclaredType('INTEGER')).toBe('INTEGER');
      expect(whereFor('INTEGER', { column: 'probe', operator: 'gt', value: 5 })).toBe(
        `\nWHERE (${NUM_EXPR}) > 5`
      );
    });

    // The no-op half, and the one that matters most on this dialect: SQL that already returned the
    // right rows must not move under a declaration with no cast target.
    it('emits no cast for a declared type this dialect states no target for', () => {
      expect(whereFor('STRING', { column: 'probe', operator: 'gt', value: '5' })).toBe(
        `\nWHERE (${NUM_EXPR}) > '5'`
      );
    });

    // A DATE declaration takes this dialect's DATE-literal cast — the one an ordinary DATE column
    // has always had and which a calculated field NEVER REACHED before, because the type resolver
    // answered `undefined` for it. It gains no numeric target: dates ship
    // as measured, and this is the dialect the cast reads MDY on, so a second one is not a fix.
    //
    // This is the SILENT one of the four dialects the change moves. Before, `(CONCAT(…)) >= '…'`
    // compared two strings lexicographically; now it is a real DATE comparison, and probe 6c goes
    // from 0 rows to 4 — the right shape for an honest formula, the wrong month for a fiction.
    it('takes the DATE literal cast a calculated field never reached before', () => {
      expect(whereFor('DATE', { column: 'probe', operator: 'gte', value: '2026-06-01' })).toBe(
        `\nWHERE (${NUM_EXPR}) >= CAST('2026-06-01' AS DATE)`
      );
    });

    // `relative_date` is NOT in the comparison set: its bounds are CURRENT_DATE arithmetic this
    // renderer inlines, so there is no bound value to impose a type on. Unlike BigQuery this
    // dialect's preset rendering reads no type at all, so the declaration reaching the resolver
    // cannot move it — pinned because nothing else renders this operator over a formula.
    it('renders relative_date over the formula, uncast and unchanged by the declaration', () => {
      for (const declared of ['DATE', 'TIMESTAMP', 'FLOAT']) {
        expect(
          whereFor(declared, {
            column: 'probe',
            operator: 'relative_date',
            value: { kind: 'today' },
          })
        ).toBe(
          `\nWHERE (${NUM_EXPR}) >= CURRENT_DATE AND (${NUM_EXPR}) < DATEADD(day, 1, CURRENT_DATE)`
        );
      }
    });

    // The imposition is a COMPARISON's, and the operator decides. Casting an `IS NULL` would
    // make ONE unparseable row fail the WHOLE query where it used to return rows — a new failure
    // mode, on a predicate that never reads a value — and a numeric target inside CONTAINS buys
    // nothing at all.
    it('leaves IS NULL, IS NOT NULL and the text matchers uncast', () => {
      const uncast = (rule: FilterRule): string => whereFor('FLOAT', rule);

      expect(uncast({ column: 'probe', operator: 'is_null' })).toBe(
        `\nWHERE (${NUM_EXPR}) IS NULL`
      );
      expect(uncast({ column: 'probe', operator: 'is_not_null' })).toBe(
        `\nWHERE (${NUM_EXPR}) IS NOT NULL`
      );
      expect(uncast({ column: 'probe', operator: 'contains', value: 'x' })).toBe(
        `\nWHERE CONTAINS((${NUM_EXPR}), 'x')`
      );
      expect(uncast({ column: 'probe', operator: 'starts_with', value: 'x' })).toBe(
        `\nWHERE STARTSWITH((${NUM_EXPR}), 'x')`
      );
      expect(uncast({ column: 'probe', operator: 'is_empty' })).toBe(
        `\nWHERE ((${NUM_EXPR}) IS NULL OR (${NUM_EXPR}) = '')`
      );
    });

    it('leaves an ordinary column of the same declared type untouched on both sides', () => {
      expect(
        r.renderWhere(
          [{ column: 'amount', operator: 'gt', value: 5 }],
          undefined,
          'p',
          () => 'FLOAT',
          r.buildCalculatedPredicateExpressions([numericText])
        ).sql
      ).toBe('\nWHERE "amount" > 5');
    });
  });
});
