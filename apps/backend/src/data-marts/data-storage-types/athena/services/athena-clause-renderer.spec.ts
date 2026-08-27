import { AthenaClauseRenderer, countPositionalPlaceholders } from './athena-clause-renderer';
import {
  CalculatedFieldPlan,
  ColumnRefResolver,
  RenderedClause,
} from '../../utils/sql-clause-renderer';
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
    it('is_blank / is_not_blank are type-aware: TRIM form on strings, NULL-only elsewhere', () => {
      const asType = (type: string) => () => type;
      expect(
        r.renderWhere([{ column: 'a', operator: 'is_blank' }], undefined, 'p', asType('VARCHAR'))
          .sql
      ).toBe(`\nWHERE ("a" IS NULL OR TRIM("a") = '')`);
      expect(
        r.renderWhere(
          [{ column: 'a', operator: 'is_not_blank' }],
          undefined,
          'p',
          asType('VARCHAR')
        ).sql
      ).toBe(`\nWHERE ("a" IS NOT NULL AND TRIM("a") <> '')`);
      expect(
        r.renderWhere([{ column: 'a', operator: 'is_blank' }], undefined, 'p', asType('BIGINT')).sql
      ).toBe('\nWHERE "a" IS NULL');
      // Unknown column type: the NULL-only form is the one that is valid SQL on any type.
      expect(r.renderWhere([{ column: 'a', operator: 'is_not_blank' }]).sql).toBe(
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

  describe('in / not_in', () => {
    it('renders IN with one positional param per value, in order', () => {
      const out = r.renderWhere([{ column: 'channel', operator: 'in', value: ['fb', 'google'] }]);
      expect(out.sql).toBe('\nWHERE "channel" IN (?, ?)');
      expect(out.params).toEqual([
        { name: 'p0', value: 'fb' },
        { name: 'p1', value: 'google' },
      ]);
    });
    it('renders NOT IN and keeps later params aligned', () => {
      const out = r.renderWhere([
        { column: 'channel', operator: 'not_in', value: ['fb', 'google'] },
        { column: 'name', operator: 'eq', value: 'X' },
      ]);
      expect(out.sql).toBe(
        '\nWHERE ("channel" IS NULL OR "channel" NOT IN (?, ?))\n  AND "name" = ?'
      );
      expect(out.params).toEqual([
        { name: 'p0', value: 'fb' },
        { name: 'p1', value: 'google' },
        { name: 'p2', value: 'X' },
      ]);
    });
    it('casts each placeholder for a DATE column', () => {
      const out = r.renderWhere(
        [{ column: 'day', operator: 'in', value: ['2026-01-01', '2026-01-02'] }],
        undefined,
        'p',
        () => 'DATE'
      );
      expect(out.sql).toBe('\nWHERE "day" IN (CAST(? AS DATE), CAST(? AS DATE))');
      expect(out.params).toHaveLength(2);
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
    it('next_n_days includes today and n days ahead', () => {
      expect(
        r.renderWhere([
          { column: 'd', operator: 'relative_date', value: { kind: 'next_n_days', n: 7 } },
        ]).sql
      ).toBe(`\nWHERE "d" >= current_date AND "d" < date_add('day', 8, current_date)`);
    });
    it('this_week / last_week are ISO (Monday) weeks', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'this_week' } }])
          .sql
      ).toBe(
        `\nWHERE "d" >= date_trunc('week', current_date) AND "d" < date_add('week', 1, date_trunc('week', current_date))`
      );
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'last_week' } }])
          .sql
      ).toBe(
        `\nWHERE "d" >= date_add('week', -1, date_trunc('week', current_date)) AND "d" < date_trunc('week', current_date)`
      );
    });
    it('this_quarter / last_quarter are calendar quarters', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'this_quarter' } }])
          .sql
      ).toBe(
        `\nWHERE "d" >= date_trunc('quarter', current_date) AND "d" < date_add('month', 3, date_trunc('quarter', current_date))`
      );
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'last_quarter' } }])
          .sql
      ).toBe(
        `\nWHERE "d" >= date_add('month', -3, date_trunc('quarter', current_date)) AND "d" < date_trunc('quarter', current_date)`
      );
    });
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
      // A calculated field's formula travels into the fragment verbatim, comments included, and
      // `FormulaViolations` recommends the `--` form by name. A `?` in one is prose, not a marker:
      // counting it threw on every filtered run of a formula that had saved green, because the
      // save-time dry run binds no parameters and never reaches this invariant.
      it('ignores ? inside SQL comments carried in from a formula', () => {
        expect(countPositionalPlaceholders('(revenue / clicks -- why not CTR?\n) = ?')).toBe(1);
        expect(countPositionalPlaceholders('(revenue /* is this CTR? */ / clicks) = ?')).toBe(1);
        expect(countPositionalPlaceholders('(revenue / clicks -- why not CTR?\n) IS NULL')).toBe(0);
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

  // AthenaFieldType is the Glue/DDL vocabulary; a query is Trino, which has no FLOAT and no STRING.
  // DECIMAL carries its scale explicitly for the same reason Redshift's textCastType
  // carries a length: a bare DECIMAL is (38,0) here, and that truncates every fraction.
  describe('castTypeForDeclaredType (declared Athena type → Trino cast target)', () => {
    // DOUBLE for the whole float family, including the 32-bit declarations. Trino's answer to a
    // declared FLOAT is REAL, but a formula like `revenue / clicks` already returns a double today,
    // and REAL would silently round it to ~7 significant digits. DOUBLE is also the spelling the
    // probe measured 12.75 through, and the one `getFloatType` gives Athena everywhere else.
    it('maps every numeric declared type, the float family to DOUBLE', () => {
      expect(r.castTypeForDeclaredType('TINYINT')).toBe('TINYINT');
      expect(r.castTypeForDeclaredType('SMALLINT')).toBe('SMALLINT');
      expect(r.castTypeForDeclaredType('INTEGER')).toBe('INTEGER');
      expect(r.castTypeForDeclaredType('BIGINT')).toBe('BIGINT');
      expect(r.castTypeForDeclaredType('FLOAT')).toBe('DOUBLE');
      expect(r.castTypeForDeclaredType('REAL')).toBe('DOUBLE');
      expect(r.castTypeForDeclaredType('DOUBLE')).toBe('DOUBLE');
      expect(r.castTypeForDeclaredType('DECIMAL')).toBe('DECIMAL(38,18)');
    });

    it('reads a declared type case-insensitively and ignores padding', () => {
      expect(r.castTypeForDeclaredType(' double ')).toBe('DOUBLE');
    });

    it('answers undefined for a type no aggregation casts to, rather than guessing a spelling', () => {
      expect(r.castTypeForDeclaredType('STRING')).toBeUndefined();
      expect(r.castTypeForDeclaredType('VARCHAR')).toBeUndefined();
      expect(r.castTypeForDeclaredType('DATE')).toBeUndefined();
      expect(r.castTypeForDeclaredType('ROW')).toBeUndefined();
    });
  });

  // The second dialect where the VALUE's JS type decides the outcome: an
  // ExecutionParameter is typed from the value it carries, so `= 10` raised `Cannot apply
  // operator: varchar = integer` while `= '10'` returned the right row, over the SAME field. The
  // placeholder now carries the declaration and one predicate serves both.
  describe('a Calculated Field comparison imposes the declared type', () => {
    const NUM_EXPR = 'CONCAT("n_prefix", "n_suffix")';
    const numericText: CalculatedFieldPlan = {
      outputName: 'probe',
      formula: 'CONCAT({{ref field="n_prefix"}}, {{ref field="n_suffix"}})',
      level: 'column',
      type: 'FLOAT',
    };
    const whereFor = (declaredType: string, rule: FilterRule): RenderedClause =>
      r.renderWhere(
        [rule],
        undefined,
        'p',
        () => declaredType,
        r.buildCalculatedPredicateExpressions([{ ...numericText, type: declaredType }])
      );

    // The declared name is the Glue/DDL vocabulary and Trino has no FLOAT at all, so both sides
    // are spelled DOUBLE — the same mapping the aggregation path already uses.
    it('casts BOTH sides of `> 5` to the Trino name of the declared type', () => {
      expect(whereFor('FLOAT', { column: 'probe', operator: 'gt', value: 5 }).sql).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS DOUBLE) > CAST(? AS DOUBLE)`
      );
    });

    it('emits ONE predicate whether the value arrives as 10 or as "10"', () => {
      const asNumber = whereFor('FLOAT', { column: 'probe', operator: 'eq', value: 10 });
      const asString = whereFor('FLOAT', { column: 'probe', operator: 'eq', value: '10' });

      expect(asNumber.sql).toBe(`\nWHERE CAST((${NUM_EXPR}) AS DOUBLE) = CAST(? AS DOUBLE)`);
      expect(asString.sql).toBe(asNumber.sql);
      expect(asNumber.params).toEqual([{ name: 'p0', value: 10 }]);
      expect(asString.params).toEqual([{ name: 'p0', value: '10' }]);
    });

    // Positional binding is why this matters more here than anywhere: `validateFragment` counts
    // the `?` against the params, so a cast that swallowed or duplicated one would throw rather
    // than shift every later value — and a range or a list is where that would happen.
    it('reaches the BETWEEN bounds and every IN list member, one `?` per param', () => {
      expect(
        whereFor('FLOAT', { column: 'probe', operator: 'between', value: { from: 1, to: 5 } }).sql
      ).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS DOUBLE) BETWEEN CAST(? AS DOUBLE) AND CAST(? AS DOUBLE)`
      );
      const inList = whereFor('FLOAT', { column: 'probe', operator: 'in', value: [9, 10] });
      expect(inList.sql).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS DOUBLE) IN (CAST(? AS DOUBLE), CAST(? AS DOUBLE))`
      );
      expect(countPositionalPlaceholders(inList.sql)).toBe(inList.params.length);
    });

    // A bare DECIMAL is (38,0) in Trino, so an unqualified target would truncate every fraction —
    // the same defect the cast exists to remove, now on the value as well as the expression.
    it('spells the scale on a DECIMAL declaration, on the value as well as the expression', () => {
      expect(whereFor('DECIMAL', { column: 'probe', operator: 'gte', value: 1.5 }).sql).toBe(
        `\nWHERE CAST((${NUM_EXPR}) AS DECIMAL(38,18)) >= CAST(? AS DECIMAL(38,18))`
      );
    });

    // Casting an integer declaration introduces a per-row conversion the warehouse was not
    // making, and Trino rounds where Spark truncates.
    it('never casts the integer family, though the mapping states targets for it', () => {
      expect(r.castTypeForDeclaredType('BIGINT')).toBe('BIGINT');
      for (const declared of ['TINYINT', 'SMALLINT', 'INTEGER', 'BIGINT']) {
        expect(whereFor(declared, { column: 'probe', operator: 'gt', value: 5 }).sql).toBe(
          `\nWHERE (${NUM_EXPR}) > ?`
        );
      }
    });

    // The no-op half: a declaration this dialect states no target for emits exactly the SQL it
    // emits today — including, deliberately, the one that raises.
    it('emits no cast for a declared type this dialect states no target for', () => {
      expect(whereFor('VARCHAR', { column: 'probe', operator: 'gt', value: '5' }).sql).toBe(
        `\nWHERE (${NUM_EXPR}) > ?`
      );
    });

    // `relative_date` is NOT in the comparison set: its bounds are `current_date` arithmetic this
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
          }).sql
        ).toBe(
          `\nWHERE (${NUM_EXPR}) >= current_date AND (${NUM_EXPR}) < date_add('day', 1, current_date)`
        );
      }
    });

    // The imposition is a COMPARISON's, and the operator decides. Casting an `IS NULL` would
    // make ONE unparseable row fail the WHOLE query where it used to return rows — a new failure
    // mode, on a predicate that never reads a value — and a numeric target inside strpos buys
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
        `\nWHERE strpos((${NUM_EXPR}), ?) > 0`
      );
      expect(uncast({ column: 'probe', operator: 'starts_with', value: 'x' })).toBe(
        `\nWHERE strpos((${NUM_EXPR}), ?) = 1`
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
      ).toBe('\nWHERE "amount" > ?');
    });
  });
});
