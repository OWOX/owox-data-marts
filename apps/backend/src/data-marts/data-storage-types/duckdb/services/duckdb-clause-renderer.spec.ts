import { DuckDbClauseRenderer } from './duckdb-clause-renderer';
import { ColumnRefResolver, RenderedClause } from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';
import { createProductionDuckDbInstance } from '../__fixtures__/production-duckdb-instance';

describe('DuckDbClauseRenderer', () => {
  const r = new DuckDbClauseRenderer();
  const col = () => '"amount"';

  // ---- brief's required tests (Step 1) ----
  it('quotes identifiers with double-quotes, escaping embedded quotes', () => {
    expect(r.quoteIdentifier('we"ird')).toBe('"we""ird"');
  });

  it('inlines a string equality with the value single-quote-escaped (no bound params)', () => {
    const frag = r.renderFilterFragment(
      { operator: 'eq', value: "o'brien" } as never,
      'p0',
      col(),
      'VARCHAR'
    );
    expect(frag.sql).toMatch(/= 'o''brien'/); // escaped, inlined
    expect(frag.params).toHaveLength(0); // NOT a bound param
  });

  it('neutralizes an injection attempt in a filter value', () => {
    const frag = r.renderFilterFragment(
      { operator: 'eq', value: "x'; DROP TABLE t; --" } as never,
      'p0',
      col(),
      'VARCHAR'
    );
    expect(frag.sql).toContain("'x''; DROP TABLE t; --'"); // the quote is doubled -> inert literal
    expect(frag.params).toHaveLength(0);
  });

  it('renders date_trunc with a validated unit', () => {
    // DateTruncUnit (DATE_TRUNC_UNITS) is the uppercase vocabulary ('MONTH', not
    // 'month') shared by every dialect's assertSafeDateTrunc guard; DuckDB lowercases
    // it itself when building the SQL token.
    expect(r.renderDateTrunc('"d"', 'MONTH')).toMatch(/date_trunc\('month', "d"\)/i);
  });

  describe('identifiers (escapeDuckDbIdentifier wiring)', () => {
    it('quotes dotted identifiers', () => {
      expect(r.renderWhere([{ column: 'db.schema.col', operator: 'eq', value: 1 }]).sql).toBe(
        '\nWHERE "db"."schema"."col" = 1'
      );
    });

    it('safely quotes a malicious column name (no breakout via quotes or payload text)', () => {
      expect(r.renderWhere([{ column: `c'; DROP TABLE x; --`, operator: 'is_null' }]).sql).toBe(
        `\nWHERE "c'; DROP TABLE x; --" IS NULL`
      );
    });
  });

  describe('scalar comparison operators (inline literals, no params)', () => {
    it('eq/neq/gt/lt/gte/lte', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'eq', value: 1 }]).sql).toBe(
        '\nWHERE "a" = 1'
      );
      // Null-inclusive: "is not X" keeps rows where the column is missing.
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

    it('booleans inline as bare TRUE/FALSE (not quoted, not stringified)', () => {
      expect(r.renderWhere([{ column: 'ok', operator: 'eq', value: true }]).sql).toBe(
        '\nWHERE "ok" = TRUE'
      );
      expect(r.renderWhere([{ column: 'ok', operator: 'eq', value: false }]).sql).toBe(
        '\nWHERE "ok" = FALSE'
      );
    });

    it('rejects non-finite numbers (Infinity/-Infinity/NaN) instead of inlining a bad token', () => {
      expect(() => r.renderWhere([{ column: 'x', operator: 'gt', value: Infinity }])).toThrow(
        /Non-finite/
      );
      expect(() => r.renderWhere([{ column: 'x', operator: 'gt', value: -Infinity }])).toThrow(
        /Non-finite/
      );
      expect(() =>
        r.renderWhere([{ column: 'x', operator: 'gt', value: NaN as unknown as number }])
      ).toThrow(/Non-finite/);
    });
  });

  describe('substring/affix matchers use DuckDB scalar functions (never LIKE, so %/_ stay literal)', () => {
    it('contains/not_contains', () => {
      expect(r.renderWhere([{ column: 'name', operator: 'contains', value: '50%_x' }]).sql).toBe(
        `\nWHERE contains("name", '50%_x')`
      );
      expect(r.renderWhere([{ column: 'name', operator: 'not_contains', value: 'x' }]).sql).toBe(
        `\nWHERE ("name" IS NULL OR NOT contains("name", 'x'))`
      );
    });

    it('starts_with/ends_with', () => {
      expect(r.renderWhere([{ column: 'name', operator: 'starts_with', value: 'a_b' }]).sql).toBe(
        `\nWHERE starts_with("name", 'a_b')`
      );
      expect(r.renderWhere([{ column: 'name', operator: 'ends_with', value: 'z%' }]).sql).toBe(
        `\nWHERE ends_with("name", 'z%')`
      );
    });

    it('regex/not_regex use regexp_matches (partial match, like the other dialects)', () => {
      expect(r.renderWhere([{ column: 'name', operator: 'regex', value: '^a.*' }]).sql).toBe(
        `\nWHERE regexp_matches("name", '^a.*')`
      );
      expect(r.renderWhere([{ column: 'name', operator: 'not_regex', value: '^a.*' }]).sql).toBe(
        `\nWHERE ("name" IS NULL OR NOT regexp_matches("name", '^a.*'))`
      );
    });
  });

  describe('injection attempts are neutralized for every text-path operator (same escaper)', () => {
    const payload = "a'); DROP TABLE t; --";
    const escaped = "a''); DROP TABLE t; --"; // single quote doubled, everything else stays inert text

    it('contains', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'contains', value: payload }]).sql).toBe(
        `\nWHERE contains("a", '${escaped}')`
      );
    });
    it('starts_with', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'starts_with', value: payload }]).sql).toBe(
        `\nWHERE starts_with("a", '${escaped}')`
      );
    });
    it('ends_with', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'ends_with', value: payload }]).sql).toBe(
        `\nWHERE ends_with("a", '${escaped}')`
      );
    });
    it('regex', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'regex', value: payload }]).sql).toBe(
        `\nWHERE regexp_matches("a", '${escaped}')`
      );
    });
    it('between (both bounds escaped independently)', () => {
      expect(
        r.renderWhere([{ column: 'a', operator: 'between', value: { from: payload, to: 'z' } }]).sql
      ).toBe(`\nWHERE "a" BETWEEN '${escaped}' AND 'z'`);
    });
    it('a lone single-quote value round-trips to a 4-quote inert token (open, doubled, close)', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'eq', value: `'` }]).sql).toBe(
        `\nWHERE "a" = ''''`
      );
    });
    it('a value that is a string but looks numeric still gets quoted+escaped (typeof drives the branch, not columnType)', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'eq', value: "1 OR 1='1" }]).sql).toBe(
        `\nWHERE "a" = '1 OR 1=''1'`
      );
    });
  });

  describe('no-value / boolean operators', () => {
    it('is_null / is_not_null', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'is_null' }]).sql).toBe('\nWHERE "a" IS NULL');
      expect(r.renderWhere([{ column: 'a', operator: 'is_not_null' }]).sql).toBe(
        '\nWHERE "a" IS NOT NULL'
      );
    });
    it('is_blank / is_not_blank: explicit-set trim on strings, NULL-only elsewhere', () => {
      const typed = (type: string) => () => type;
      expect(
        r.renderWhere([{ column: 's', operator: 'is_blank' }], undefined, 'p', typed('VARCHAR')).sql
      ).toBe(
        `\nWHERE (CAST("s" AS VARCHAR) IS NULL OR trim(CAST("s" AS VARCHAR), ' ' || chr(9) || chr(10) || chr(13)) = '')`
      );
      expect(
        r.renderWhere([{ column: 's', operator: 'is_not_blank' }], undefined, 'p', typed('VARCHAR'))
          .sql
      ).toBe(
        `\nWHERE (CAST("s" AS VARCHAR) IS NOT NULL AND trim(CAST("s" AS VARCHAR), ' ' || chr(9) || chr(10) || chr(13)) <> '')`
      );
      expect(
        r.renderWhere([{ column: 'n', operator: 'is_blank' }], undefined, 'p', typed('BIGINT')).sql
      ).toBe('\nWHERE "n" IS NULL');
    });
    it('is_empty / is_not_empty', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'is_empty' }]).sql).toBe(
        `\nWHERE ("a" IS NULL OR "a" = '')`
      );
      expect(r.renderWhere([{ column: 'a', operator: 'is_not_empty' }]).sql).toBe(
        `\nWHERE ("a" IS NOT NULL AND "a" <> '')`
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

  describe('multiple filters (AND combination) stay fully inlined', () => {
    it('every literal is escaped across the chain, params stays empty', () => {
      const out = r.renderWhere([
        { column: 'name', operator: 'eq', value: "O'Brien" },
        { column: 'age', operator: 'gt', value: 30 },
      ]);
      expect(out.sql).toBe(`\nWHERE "name" = 'O''Brien'\n  AND "age" > 30`);
      expect(out.params).toEqual([]);
    });
  });

  describe('relative_date presets (half-open ranges with upper bounds; DuckDB INTERVAL arithmetic)', () => {
    it('today', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'today' } }]).sql
      ).toBe(`\nWHERE "d" >= CURRENT_DATE AND "d" < CURRENT_DATE + INTERVAL 1 DAY`);
    });
    it('yesterday', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'yesterday' } }])
          .sql
      ).toBe(`\nWHERE "d" >= CURRENT_DATE - INTERVAL 1 DAY AND "d" < CURRENT_DATE`);
    });
    it('last_n_days has an upper bound', () => {
      expect(
        r.renderWhere([
          { column: 'd', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } },
        ]).sql
      ).toBe(
        `\nWHERE "d" >= CURRENT_DATE - INTERVAL 7 DAY AND "d" < CURRENT_DATE + INTERVAL 1 DAY`
      );
    });
    it('last_n_months has an upper bound', () => {
      expect(
        r.renderWhere([
          { column: 'd', operator: 'relative_date', value: { kind: 'last_n_months', n: 3 } },
        ]).sql
      ).toBe(
        `\nWHERE "d" >= CURRENT_DATE - INTERVAL 3 MONTH AND "d" < CURRENT_DATE + INTERVAL 1 DAY`
      );
    });
    it('this_month', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'this_month' } }])
          .sql
      ).toBe(
        `\nWHERE "d" >= date_trunc('month', CURRENT_DATE) AND "d" < date_trunc('month', CURRENT_DATE) + INTERVAL 1 MONTH`
      );
    });
    it('last_month', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'last_month' } }])
          .sql
      ).toBe(
        `\nWHERE "d" >= date_trunc('month', CURRENT_DATE) - INTERVAL 1 MONTH AND "d" < date_trunc('month', CURRENT_DATE)`
      );
    });
    it('this_year', () => {
      expect(
        r.renderWhere([{ column: 'd', operator: 'relative_date', value: { kind: 'this_year' } }])
          .sql
      ).toBe(
        `\nWHERE "d" >= date_trunc('year', CURRENT_DATE) AND "d" < date_trunc('year', CURRENT_DATE) + INTERVAL 1 YEAR`
      );
    });
    it('rejects a non-integer n', () => {
      expect(() =>
        r.renderWhere([
          { column: 'd', operator: 'relative_date', value: { kind: 'last_n_days', n: 7.5 } },
        ])
      ).toThrow(/Invalid relative_date n/);
    });
    it('rejects a negative n', () => {
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
    it('rejects a non-numeric n that bypassed the zod validator (defense in depth)', () => {
      expect(() =>
        r.renderWhere([
          {
            column: 'd',
            operator: 'relative_date',
            value: { kind: 'last_n_days', n: '1); DROP TABLE t --' as unknown as number },
          },
        ])
      ).toThrow(/Invalid relative_date n/);
    });
  });

  describe('column qualification (blended path)', () => {
    const qualify: ColumnRefResolver = column => `main."${column}"`;
    it('honours the resolver for WHERE and ORDER BY', () => {
      expect(r.renderWhere([{ column: 'a', operator: 'eq', value: 1 }], qualify).sql).toBe(
        '\nWHERE main."a" = 1'
      );
      expect(r.renderOrderBy([{ column: 'a', direction: 'asc' }], qualify).sql).toBe(
        '\nORDER BY\n  main."a" ASC'
      );
    });
  });

  describe('validateFragment invariant (every fragment must inline; never emit a bound param)', () => {
    it('throws if a fragment carries a bound param', () => {
      const bogus: RenderedClause = { sql: '"a" = ?', params: [{ name: 'p0', value: 1 }] };
      expect(() => (r as any).validateFragment(bogus)).toThrow(/must inline all values/);
    });
    it('passes silently for a properly inlined fragment', () => {
      const ok: RenderedClause = { sql: '"a" = 1', params: [] };
      expect(() => (r as any).validateFragment(ok)).not.toThrow();
    });
  });

  describe('live DuckDB execution (this dialect, unlike the cloud warehouses, can run locally in CI)', () => {
    it.each([
      ['today', 'after_utc_midnight'],
      ['yesterday', 'before_utc_midnight'],
    ] as const)(
      'relative_date %s on a TIMESTAMPTZ uses the UTC date, whatever the host zone',
      async (kind, expectedId) => {
        const utcMidnight = new Date();
        utcMidnight.setUTCHours(0, 0, 0, 0);
        const minutesFromMidnight = (minutes: number) =>
          new Date(utcMidnight.getTime() + minutes * 60_000).toISOString();
        const instance = await createProductionDuckDbInstance();
        const connection = await instance.connect();
        try {
          await connection.run(
            `CREATE TABLE t AS SELECT * FROM (VALUES ` +
              `('before_utc_midnight', TIMESTAMPTZ '${minutesFromMidnight(-1)}'), ` +
              `('after_utc_midnight', TIMESTAMPTZ '${minutesFromMidnight(1)}')) AS v(id, ts)`
          );
          const where = r.renderWhere(
            [{ column: 'ts', operator: 'relative_date', value: { kind } }],
            undefined,
            'p',
            () => 'TIMESTAMPTZ'
          );
          const reader = await connection.runAndReadAll(`SELECT id FROM t${where.sql}`);
          expect(reader.getRowObjects()).toEqual([{ id: expectedId }]);
        } finally {
          connection.closeSync();
          instance.closeSync();
        }
      }
    );

    // '2024-03-01' is midnight UTC: 23:00 UTC on 02-29 is before it, even where it is already March.
    it.each<[FilterRule, string[]]>([
      [{ column: 'ts', operator: 'gte', value: '2024-03-01' }, ['mar01_00utc', 'mar01_10utc']],
      [{ column: 'ts', operator: 'lt', value: '2024-03-01' }, ['feb29_23utc']],
      [{ column: 'ts', operator: 'eq', value: '2024-03-01 10:00:00' }, ['mar01_10utc']],
      // A literal's own offset or zone wins over UTC.
      [
        { column: 'ts', operator: 'gte', value: '2024-03-01T01:00:00+01:00' },
        ['mar01_00utc', 'mar01_10utc'],
      ],
      [{ column: 'ts', operator: 'lt', value: '2024-03-01 02:00:00+02' }, ['feb29_23utc']],
      [{ column: 'ts', operator: 'eq', value: '2024-03-01 12:00:00 Europe/Kyiv' }, ['mar01_10utc']],
      [
        { column: 'ts', operator: 'gte', value: '2024-03-01T00:00:00Z' },
        ['mar01_00utc', 'mar01_10utc'],
      ],
      [
        {
          column: 'ts',
          operator: 'between',
          value: { from: '2024-03-01', to: '2024-03-01 09:00' },
        },
        ['mar01_00utc'],
      ],
    ])(
      'compares a TIMESTAMPTZ with a literal in UTC unless it names a zone, whatever the host zone (%o)',
      async (rule, expectedIds) => {
        const instance = await createProductionDuckDbInstance();
        const connection = await instance.connect();
        try {
          await connection.run(
            `CREATE TABLE t AS SELECT * FROM (VALUES ` +
              `('feb29_23utc', TIMESTAMPTZ '2024-02-29 23:00:00+00'), ` +
              `('mar01_00utc', TIMESTAMPTZ '2024-03-01 00:00:00+00'), ` +
              `('mar01_10utc', TIMESTAMPTZ '2024-03-01 10:00:00+00')) AS v(id, ts)`
          );
          const where = r.renderWhere([rule], undefined, 'p', () => 'TIMESTAMPTZ');
          const reader = await connection.runAndReadAll(`SELECT id FROM t${where.sql} ORDER BY id`);
          expect(reader.getRowObjects().map(row => row.id)).toEqual(expectedIds);
        } finally {
          connection.closeSync();
          instance.closeSync();
        }
      }
    );

    it.each<[FilterRule, number[]]>([
      [{ column: 'tags', operator: 'contains', value: ', ' }, [1]],
      [{ column: 'tags', operator: 'eq', value: '[3]' }, [2]],
      [{ column: 'tags', operator: 'in', value: ['[3]'] }, [2]],
      [{ column: 'tags', operator: 'is_blank' }, [3]],
      [{ column: 'info', operator: 'contains', value: 'y' }, [2]],
      [{ column: 'info', operator: 'starts_with', value: "{'a': 1" }, [1]],
      [{ column: 'info', operator: 'is_not_blank' }, [1, 2]],
    ])(
      'filters a LIST or STRUCT column declared VARCHAR as text (%o)',
      async (rule, expectedIds) => {
        const instance = await createProductionDuckDbInstance();
        const connection = await instance.connect();
        try {
          await connection.run(
            `CREATE TABLE t AS SELECT * FROM (VALUES ` +
              `(1, [1, 2], {'a': 1, 'b': 'x'}), (2, [3], {'a': 2, 'b': 'y'}), (3, NULL, NULL)` +
              `) AS v(id, tags, info)`
          );
          const where = r.renderWhere([rule], undefined, 'p', () => 'VARCHAR');
          const reader = await connection.runAndReadAll(`SELECT id FROM t${where.sql} ORDER BY id`);
          expect(reader.getRowObjects().map(row => row.id)).toEqual(expectedIds);
        } finally {
          connection.closeSync();
          instance.closeSync();
        }
      }
    );

    it('a DROP-TABLE payload in a filter value runs as an inert literal comparison; table survives', async () => {
      const instance = await createProductionDuckDbInstance();
      const connection = await instance.connect();
      try {
        await connection.run('CREATE TABLE t (id INTEGER, name VARCHAR)');
        await connection.run(`INSERT INTO t VALUES (1, 'alice'), (2, 'bob')`);
        const payload = "x'; DROP TABLE t; --";
        const where = r.renderWhere([{ column: 'name', operator: 'eq', value: payload }]);
        expect(where.params).toHaveLength(0);

        const reader = await connection.runAndReadAll(`SELECT * FROM t${where.sql}`);
        // The payload matches no real row: zero rows, no thrown error.
        expect(reader.getRowObjects()).toHaveLength(0);

        // If the DROP had escaped the literal, this table would no longer exist.
        const check = await connection.runAndReadAll('SELECT COUNT(*) AS n FROM t');
        expect(Number(check.getRowObjects()[0].n)).toBe(2);
      } finally {
        connection?.closeSync?.();
        instance?.closeSync?.();
      }
    });

    it('renders SQL DuckDB actually accepts for every operator (catches "plausible but invalid" syntax)', async () => {
      const instance = await createProductionDuckDbInstance();
      const connection = await instance.connect();
      try {
        await connection.run(
          'CREATE TABLE t (id INTEGER, name VARCHAR, amount DOUBLE, flag BOOLEAN, d DATE)'
        );
        await connection.run(
          `INSERT INTO t VALUES ` +
            `(1, 'alice', 10.5, TRUE, DATE '2024-01-01'), ` +
            `(2, 'bob', 20.0, FALSE, DATE '2024-06-15')`
        );

        const cases: FilterRule[] = [
          { column: 'amount', operator: 'eq', value: 10.5 },
          { column: 'amount', operator: 'neq', value: 10.5 },
          { column: 'amount', operator: 'gt', value: 1 },
          { column: 'amount', operator: 'lt', value: 100 },
          { column: 'amount', operator: 'gte', value: 10.5 },
          { column: 'amount', operator: 'lte', value: 10.5 },
          { column: 'name', operator: 'contains', value: 'ali' },
          { column: 'name', operator: 'not_contains', value: 'zzz' },
          { column: 'name', operator: 'starts_with', value: 'a' },
          { column: 'name', operator: 'ends_with', value: 'e' },
          { column: 'name', operator: 'regex', value: '^a.*' },
          { column: 'name', operator: 'not_regex', value: '^z.*' },
          { column: 'name', operator: 'is_empty' },
          { column: 'name', operator: 'is_not_empty' },
          { column: 'name', operator: 'is_null' },
          { column: 'name', operator: 'is_not_null' },
          { column: 'flag', operator: 'is_true' },
          { column: 'flag', operator: 'is_false' },
          { column: 'amount', operator: 'between', value: { from: 1, to: 100 } },
          { column: 'd', operator: 'relative_date', value: { kind: 'today' } },
          { column: 'd', operator: 'relative_date', value: { kind: 'yesterday' } },
          { column: 'd', operator: 'relative_date', value: { kind: 'last_n_days', n: 30 } },
          { column: 'd', operator: 'relative_date', value: { kind: 'last_n_months', n: 6 } },
          { column: 'd', operator: 'relative_date', value: { kind: 'this_month' } },
          { column: 'd', operator: 'relative_date', value: { kind: 'last_month' } },
          { column: 'd', operator: 'relative_date', value: { kind: 'this_year' } },
        ];

        for (const rule of cases) {
          const where = r.renderWhere([rule]);
          expect(where.params).toEqual([]);
          await expect(
            connection.runAndReadAll(`SELECT * FROM t${where.sql}`)
          ).resolves.toBeDefined();
        }

        // date_trunc + quantile_cont end-to-end through renderAggregatedSelect.
        const agg = r.renderAggregatedSelect(['id'], [{ column: 'amount', function: 'P50' }]);
        await expect(
          connection.runAndReadAll(`SELECT ${agg.selectSql} FROM t${agg.groupBySql}`)
        ).resolves.toBeDefined();
      } finally {
        connection?.closeSync?.();
        instance?.closeSync?.();
      }
    });
  });
});
