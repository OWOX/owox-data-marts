import { RedshiftClauseRenderer } from './redshift-clause-renderer';
import {
  CalculatedFieldPlan,
  ColumnRefResolver,
  RenderedClause,
} from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';

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
      ).toBe(`\nWHERE ("channel" IS NULL OR "channel" NOT IN ('fb', 'google'))`);
    });
    it('neq/gt/lt/gte/lte', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'neq', value: 1 }]).sql).toBe(
        '\nWHERE ("a" IS NULL OR "a" <> 1)'
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
        `\nWHERE ("a" IS NULL OR STRPOS("a", 'X') = 0)`
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
        `\nWHERE ("a" IS NULL OR "a" !~ '^x')`
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
    it('next_n_days includes today and n days ahead', () => {
      expect(
        r.renderWhere([
          { column: 'd', operator: 'relative_date', value: { kind: 'next_n_days', n: 7 } },
        ]).sql
      ).toBe(`\nWHERE "d" >= CURRENT_DATE AND "d" < DATEADD(day, 8, CURRENT_DATE)`);
    });
    it('this_week / last_week use the Monday-fixed DATE_TRUNC week', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'this_week' } }])
          .sql
      ).toBe(
        `\nWHERE "d" >= DATE_TRUNC('week', CURRENT_DATE) AND "d" < DATEADD(day, 7, DATE_TRUNC('week', CURRENT_DATE))`
      );
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'last_week' } }])
          .sql
      ).toBe(
        `\nWHERE "d" >= DATEADD(day, -7, DATE_TRUNC('week', CURRENT_DATE)) AND "d" < DATE_TRUNC('week', CURRENT_DATE)`
      );
    });
    it('this_quarter / last_quarter are calendar quarters', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'this_quarter' } }])
          .sql
      ).toBe(
        `\nWHERE "d" >= DATE_TRUNC('quarter', CURRENT_DATE) AND "d" < DATEADD(month, 3, DATE_TRUNC('quarter', CURRENT_DATE))`
      );
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'last_quarter' } }])
          .sql
      ).toBe(
        `\nWHERE "d" >= DATEADD(month, -3, DATE_TRUNC('quarter', CURRENT_DATE)) AND "d" < DATE_TRUNC('quarter', CURRENT_DATE)`
      );
    });
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

  // The dialect the probe caught returning 12 where 12.75 is correct: Redshift coerces a text
  // expression to Decimal with SCALE 0 and truncates every row before summing. Every
  // exact type therefore states its scale, the way textCastType states its VARCHAR length — a bare
  // DECIMAL/NUMERIC is (18,0) here, which is the same defect wearing a CAST.
  describe('castTypeForDeclaredType (declared Redshift type → cast target)', () => {
    // A declared REAL widens to DOUBLE PRECISION rather than staying 32-bit: today there is no cast
    // at all, so an expression that already computes in float8 would lose ~9 significant digits to
    // a REAL target — a silently changed number on a path that works.
    it('maps every numeric declared type, keeping the two-word float name intact', () => {
      expect(r.castTypeForDeclaredType('SMALLINT')).toBe('SMALLINT');
      expect(r.castTypeForDeclaredType('INTEGER')).toBe('INTEGER');
      expect(r.castTypeForDeclaredType('BIGINT')).toBe('BIGINT');
      expect(r.castTypeForDeclaredType('REAL')).toBe('DOUBLE PRECISION');
      expect(r.castTypeForDeclaredType('DOUBLE PRECISION')).toBe('DOUBLE PRECISION');
      expect(r.castTypeForDeclaredType('DECIMAL')).toBe('DECIMAL(38,18)');
      expect(r.castTypeForDeclaredType('NUMERIC')).toBe('NUMERIC(38,18)');
    });

    it('reads a declared type case-insensitively and ignores padding', () => {
      expect(r.castTypeForDeclaredType(' double precision ')).toBe('DOUBLE PRECISION');
    });

    it('answers undefined for a type no aggregation casts to, rather than guessing a spelling', () => {
      expect(r.castTypeForDeclaredType('VARCHAR')).toBeUndefined();
      expect(r.castTypeForDeclaredType('DATE')).toBeUndefined();
      expect(r.castTypeForDeclaredType('SUPER')).toBeUndefined();
    });
  });

  // This is the dialect that produced the measured silent wrong answer: the
  // probe filtered a FLOAT-declared formula returning '9', '10' and '100' with `> 5` and got back
  // `9` alone — Redshift coerces the numeric literal to TEXT and compares lexicographically, so a
  // plausible one-row report lost its two largest values with no error and no NULL. Both sides of
  // the comparison now carry the declaration, which makes the same predicate arithmetic.
  describe('a Calculated Field comparison imposes the declared type', () => {
    // Redshift's CONCAT is binary-only, so the probe's formula says `||` here — the operator that
    // makes the parentheses around the substituted expression load-bearing.
    const NUM_EXPR = '"n_prefix" || "n_suffix"';
    const numericText: CalculatedFieldPlan = {
      outputName: 'probe',
      formula: '{{ref field="n_prefix"}} || {{ref field="n_suffix"}}',
      level: 'column',
      type: 'DOUBLE PRECISION',
    };
    const whereFor = (declaredType: string, rule: FilterRule): string =>
      r.renderWhere(
        [rule],
        undefined,
        'p',
        () => declaredType,
        r.buildCalculatedPredicateExpressions([{ ...numericText, type: declaredType }])
      ).sql;

    it('casts BOTH sides of `> 5` to the declared type: probe shape 1 returned 9 alone', () => {
      expect(whereFor('DOUBLE PRECISION', { column: 'probe', operator: 'gt', value: 5 })).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS DOUBLE PRECISION) > CAST(5 AS DOUBLE PRECISION)`
      );
    });

    // The scale is the point on this dialect: a bare DECIMAL is (18,0) here, so an unqualified
    // target would re-create inside the CAST the truncation the CAST exists to remove.
    it('spells the scale on a DECIMAL declaration, on the value as well as the expression', () => {
      expect(whereFor('DECIMAL', { column: 'probe', operator: 'gte', value: 1.5 })).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS DECIMAL(38,18)) >= CAST(1.5 AS DECIMAL(38,18))`
      );
    });

    // `= 10` and `= '10'` over ONE field flip BigQuery and Athena between a hard error and
    // the right answer today, because nothing consults the declaration. Here the JS type only
    // decides how the literal is spelled inside a cast that is the same either way.
    it('binds the literal under the declaration whether the value arrives as 10 or as "10"', () => {
      expect(whereFor('DOUBLE PRECISION', { column: 'probe', operator: 'eq', value: 10 })).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS DOUBLE PRECISION) = CAST(10 AS DOUBLE PRECISION)`
      );
      expect(whereFor('DOUBLE PRECISION', { column: 'probe', operator: 'eq', value: '10' })).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS DOUBLE PRECISION) = CAST('10' AS DOUBLE PRECISION)`
      );
    });

    // Every value slot, not just the scalar ones: a list or a range that skipped the cast would
    // compare lexicographically again on the operators an analyst reaches for most on a number.
    it('reaches the BETWEEN bounds and every IN list member', () => {
      expect(
        whereFor('DOUBLE PRECISION', {
          column: 'probe',
          operator: 'between',
          value: { from: 1, to: 5 },
        })
      ).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS DOUBLE PRECISION) BETWEEN CAST(1 AS DOUBLE PRECISION) ` +
          `AND CAST(5 AS DOUBLE PRECISION)`
      );
      expect(
        whereFor('DOUBLE PRECISION', { column: 'probe', operator: 'in', value: [9, 10] })
      ).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS DOUBLE PRECISION) IN (CAST(9 AS DOUBLE PRECISION), ` +
          `CAST(10 AS DOUBLE PRECISION))`
      );
    });

    // Casting an INTEGER declaration would introduce the very per-row conversion the cast
    // exists to remove, and Spark truncates where this dialect rounds — the same report, two
    // totals. The mapping states a target for it; declining to use it is the comparison's policy.
    it('never casts an INTEGER declaration, though the mapping states a target for it', () => {
      expect(r.castTypeForDeclaredType('INTEGER')).toBe('INTEGER');
      for (const declared of ['SMALLINT', 'INTEGER', 'BIGINT']) {
        expect(whereFor(declared, { column: 'probe', operator: 'gt', value: 5 })).toBe(
          `\nWHERE (${NUM_EXPR}) > 5`
        );
      }
    });

    // The no-op half: a declaration this dialect states no target for emits exactly the SQL it
    // emits today — including, deliberately, the lexicographic one.
    it('emits no cast for a declared type this dialect states no target for', () => {
      expect(whereFor('VARCHAR', { column: 'probe', operator: 'gt', value: '5' })).toBe(
        `\nWHERE (${NUM_EXPR}) > '5'`
      );
    });

    // `relative_date` is NOT in the comparison set: its bounds are CURRENT_DATE arithmetic this
    // renderer inlines, so there is no bound value to impose a type on. Unlike BigQuery this
    // dialect's preset rendering reads no type at all, so the declaration reaching the resolver
    // cannot move it — pinned because nothing else renders this operator over a formula.
    it('renders relative_date over the formula, uncast and unchanged by the declaration', () => {
      for (const declared of ['DATE', 'TIMESTAMP', 'DOUBLE PRECISION']) {
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
    // mode, on a predicate that never reads a value — and a numeric target inside STRPOS buys
    // nothing at all.
    it('leaves IS NULL, IS NOT NULL and the text matchers uncast', () => {
      const uncast = (rule: FilterRule): string => whereFor('DOUBLE PRECISION', rule);

      expect(uncast({ column: 'probe', operator: 'is_null' })).toBe(
        `\nWHERE (${NUM_EXPR}) IS NULL`
      );
      expect(uncast({ column: 'probe', operator: 'is_not_null' })).toBe(
        `\nWHERE (${NUM_EXPR}) IS NOT NULL`
      );
      expect(uncast({ column: 'probe', operator: 'contains', value: 'x' })).toBe(
        `\nWHERE STRPOS((${NUM_EXPR}), 'x') > 0`
      );
      expect(uncast({ column: 'probe', operator: 'starts_with', value: 'x' })).toBe(
        `\nWHERE STRPOS((${NUM_EXPR}), 'x') = 1`
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
          () => 'DOUBLE PRECISION',
          r.buildCalculatedPredicateExpressions([numericText])
        ).sql
      ).toBe('\nWHERE "amount" > 5');
    });

    // The other clause, same imposition: an AGGREGATE-level field's rule carries no function and
    // its formula is the HAVING left-hand side.
    it('imposes the declaration in HAVING too, for an aggregate-level field', () => {
      const roas: CalculatedFieldPlan = {
        outputName: 'roas',
        formula: 'SUM({{ref field="revenue"}}) / NULLIF(SUM({{ref field="cost"}}), 0)',
        level: 'metric',
        type: 'DOUBLE PRECISION',
      };
      const out = r.renderHaving(
        [{ column: 'roas', operator: 'gt', value: 1.5, clause: 'having' }],
        undefined,
        'h',
        () => 'DOUBLE PRECISION',
        undefined,
        r.buildCalculatedPredicateExpressions([roas])
      );

      expect(out.sql).toBe(
        '\nHAVING CAST((SUM("revenue") / NULLIF(SUM("cost"), 0)) AS DOUBLE PRECISION) > ' +
          'CAST(1.5 AS DOUBLE PRECISION)'
      );
    });
  });
});
