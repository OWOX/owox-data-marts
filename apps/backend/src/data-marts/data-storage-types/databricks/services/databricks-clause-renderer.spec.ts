import { DatabricksClauseRenderer } from './databricks-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';
import { CalculatedFieldPlan } from '../../utils/sql-clause-renderer';

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
      "\nWHERE (`channel` IS NULL OR `channel` NOT IN ('fb', 'google'))"
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
      "\nWHERE (`name` IS NULL OR NOT contains(`name`, 'x'))"
    );
    expect(where(r, { column: 'name', operator: 'regex', value: '^a.*' })).toBe(
      "\nWHERE `name` RLIKE '^a.*'"
    );
    expect(where(r, { column: 'name', operator: 'not_regex', value: '^a.*' })).toBe(
      "\nWHERE (`name` IS NULL OR NOT (`name` RLIKE '^a.*'))"
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
    expect(where(r, { column: 'n', operator: 'neq', value: 1 })).toBe(
      '\nWHERE (`n` IS NULL OR `n` <> 1)'
    );
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

  // Spark SQL spells its own vocabulary, so most entries are identities — DECIMAL is not: a bare
  // one is (10,0) here, and casting to it would truncate every fraction.
  describe('castTypeForDeclaredType (declared Databricks type → Spark SQL cast target)', () => {
    // Spark's FLOAT is 32-bit, so a declared FLOAT widens to DOUBLE: `12.75` was measured through
    // DOUBLE here, and a formula returning a double today would silently round to ~7 significant
    // digits under a FLOAT target.
    it('maps every numeric declared type, giving DECIMAL an explicit scale', () => {
      expect(r.castTypeForDeclaredType('TINYINT')).toBe('TINYINT');
      expect(r.castTypeForDeclaredType('SMALLINT')).toBe('SMALLINT');
      expect(r.castTypeForDeclaredType('INT')).toBe('INT');
      expect(r.castTypeForDeclaredType('BIGINT')).toBe('BIGINT');
      expect(r.castTypeForDeclaredType('FLOAT')).toBe('DOUBLE');
      expect(r.castTypeForDeclaredType('DOUBLE')).toBe('DOUBLE');
      expect(r.castTypeForDeclaredType('DECIMAL')).toBe('DECIMAL(38,18)');
    });

    it('reads a declared type case-insensitively and ignores padding', () => {
      expect(r.castTypeForDeclaredType(' double ')).toBe('DOUBLE');
    });

    it('answers undefined for a type no aggregation casts to, rather than guessing a spelling', () => {
      expect(r.castTypeForDeclaredType('STRING')).toBeUndefined();
      expect(r.castTypeForDeclaredType('DATE')).toBeUndefined();
      expect(r.castTypeForDeclaredType('MAP')).toBeUndefined();
    });
  });

  // Like Snowflake this dialect already coerced the probe's `> 5` correctly, so the
  // point here is the NO-OP plus the declaration finally being stated — and the integer rule matters most on
  // this dialect, because Spark's `CAST(1.5 AS INT)` TRUNCATES where the other four round.
  describe('a Calculated Field comparison imposes the declared type', () => {
    const NUM_EXPR = 'CONCAT(`n_prefix`, `n_suffix`)';
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

    // Spark's FLOAT is 32-bit and `12.75` was measured through DOUBLE, so a declared FLOAT widens
    // on the value exactly as it does on the expression.
    it('casts BOTH sides of `> 5` to the widened Spark name of the declared type', () => {
      expect(whereFor('FLOAT', { column: 'probe', operator: 'gt', value: 5 })).toBe(
        '\nWHERE CAST((' + NUM_EXPR + ') AS DOUBLE) > CAST(5 AS DOUBLE)'
      );
    });

    it('binds the literal under the declaration whether the value arrives as 10 or as "10"', () => {
      expect(whereFor('FLOAT', { column: 'probe', operator: 'eq', value: 10 })).toBe(
        '\nWHERE CAST((' + NUM_EXPR + ') AS DOUBLE) = CAST(10 AS DOUBLE)'
      );
      expect(whereFor('FLOAT', { column: 'probe', operator: 'eq', value: '10' })).toBe(
        '\nWHERE CAST((' + NUM_EXPR + ") AS DOUBLE) = CAST('10' AS DOUBLE)"
      );
    });

    // A bare DECIMAL is (10,0) in Spark, so an unqualified target on either side would truncate.
    it('spells the scale on a DECIMAL declaration, on the value as well as the expression', () => {
      expect(whereFor('DECIMAL', { column: 'probe', operator: 'gte', value: 1.5 })).toBe(
        '\nWHERE CAST((' + NUM_EXPR + ') AS DECIMAL(38,18)) >= CAST(1.5 AS DECIMAL(38,18))'
      );
    });

    it('reaches the BETWEEN bounds and every IN list member', () => {
      expect(
        whereFor('FLOAT', { column: 'probe', operator: 'between', value: { from: 1, to: 5 } })
      ).toBe(
        '\nWHERE CAST((' + NUM_EXPR + ') AS DOUBLE) BETWEEN CAST(1 AS DOUBLE) AND CAST(5 AS DOUBLE)'
      );
      expect(whereFor('FLOAT', { column: 'probe', operator: 'in', value: [9, 10] })).toBe(
        '\nWHERE CAST((' + NUM_EXPR + ') AS DOUBLE) IN (CAST(9 AS DOUBLE), CAST(10 AS DOUBLE))'
      );
    });

    // On the dialect that makes the rule non-negotiable: casting an integer declaration here
    // truncates where the other four round, so one report would answer differently per warehouse.
    it('never casts the integer family, which Spark truncates where the others round', () => {
      expect(r.castTypeForDeclaredType('INT')).toBe('INT');
      for (const declared of ['TINYINT', 'SMALLINT', 'INT', 'BIGINT']) {
        expect(whereFor(declared, { column: 'probe', operator: 'gt', value: 5 })).toBe(
          '\nWHERE (' + NUM_EXPR + ') > 5'
        );
      }
    });

    // The no-op half: SQL that already returned the right rows must not move under a declaration
    // this dialect states no target for.
    it('emits no cast for a declared type this dialect states no target for', () => {
      expect(whereFor('STRING', { column: 'probe', operator: 'gt', value: '5' })).toBe(
        '\nWHERE (' + NUM_EXPR + ") > '5'"
      );
    });

    // `relative_date` is NOT in the comparison set: its bounds are CURRENT_DATE arithmetic this
    // renderer inlines, so there is no bound value to impose a type on. Unlike BigQuery this
    // dialect's preset rendering reads no type at all, so the declaration reaching the resolver
    // cannot move it — pinned because nothing else renders this operator over a formula.
    it('renders relative_date over the formula, uncast and unchanged by the declaration', () => {
      for (const declared of ['DATE', 'TIMESTAMP', 'DOUBLE']) {
        expect(
          whereFor(declared, {
            column: 'probe',
            operator: 'relative_date',
            value: { kind: 'today' },
          })
        ).toBe(
          '\nWHERE (' +
            NUM_EXPR +
            ') >= CURRENT_DATE AND (' +
            NUM_EXPR +
            ') < date_add(CURRENT_DATE, 1)'
        );
      }
    });

    // The imposition is a COMPARISON's, and the operator decides. Casting an `IS NULL` would
    // make ONE unparseable row fail the WHOLE query where it used to return rows — and on this
    // dialect that is not hypothetical: the probe's own `CAST_INVALID_INPUT` names the ROW's value.
    it('leaves IS NULL, IS NOT NULL and the text matchers uncast', () => {
      const uncast = (rule: FilterRule): string => whereFor('FLOAT', rule);

      expect(uncast({ column: 'probe', operator: 'is_null' })).toBe(
        '\nWHERE (' + NUM_EXPR + ') IS NULL'
      );
      expect(uncast({ column: 'probe', operator: 'is_not_null' })).toBe(
        '\nWHERE (' + NUM_EXPR + ') IS NOT NULL'
      );
      expect(uncast({ column: 'probe', operator: 'contains', value: 'x' })).toBe(
        '\nWHERE contains((' + NUM_EXPR + "), 'x')"
      );
      expect(uncast({ column: 'probe', operator: 'is_empty' })).toBe(
        '\nWHERE ((' + NUM_EXPR + ') IS NULL OR (' + NUM_EXPR + ") = '')"
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
      ).toBe('\nWHERE `amount` > 5');
    });
  });
});
