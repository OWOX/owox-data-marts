import { ColumnRefResolver, SqlClauseRenderer, RenderedClause } from './sql-clause-renderer';
import { UNIQUE_COUNT_LABEL } from '../../dto/schemas/aggregation-labels';
import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { SortRule } from '../../dto/schemas/sort-config.schema';
import { DateTruncUnit } from '../../dto/schemas/date-trunc-config.schema';
import { BigQueryClauseRenderer } from '../bigquery/services/bigquery-clause-renderer';
import { AthenaClauseRenderer } from '../athena/services/athena-clause-renderer';
import { RedshiftClauseRenderer } from '../redshift/services/redshift-clause-renderer';
import { SnowflakeClauseRenderer } from '../snowflake/services/snowflake-clause-renderer';
import { DatabricksClauseRenderer } from '../databricks/services/databricks-clause-renderer';

class StubRenderer extends SqlClauseRenderer {
  protected quoteIdentifier(name: string): string {
    return `"${name}"`;
  }
  public override textCastType(): string {
    return 'STRING';
  }
  protected renderDateTrunc(columnRef: string, unit: DateTruncUnit): string {
    return `DATE_TRUNC(${columnRef}, ${unit})`;
  }
  protected renderFilterFragment(
    rule: FilterRule,
    paramName: string,
    columnRef: string
  ): RenderedClause {
    if (rule.operator === 'eq') {
      return {
        sql: `${columnRef} = @${paramName}`,
        params: [{ name: paramName, value: rule.value }],
      };
    }
    if (rule.operator === 'is_empty') {
      return { sql: `${columnRef} IS NULL`, params: [] };
    }
    return { sql: '1=1', params: [] };
  }
}

describe('SqlClauseRenderer', () => {
  const r = new StubRenderer();

  it('renders empty when no clauses given', () => {
    expect(r.renderWhere([]).sql).toBe('');
    expect(r.renderOrderBy([]).sql).toBe('');
    expect(r.renderLimit(null).sql).toBe('');
  });

  it('renders single filter as WHERE', () => {
    const out = r.renderWhere([{ column: 'a', operator: 'eq', value: 1 }]);
    expect(out.sql).toBe('\nWHERE "a" = @p0');
    expect(out.params).toEqual([{ name: 'p0', value: 1 }]);
  });

  it('joins multiple filters with AND and increments param indices correctly', () => {
    const out = r.renderWhere([
      { column: 'a', operator: 'eq', value: 1 },
      { column: 'b', operator: 'is_empty' },
    ]);
    expect(out.sql).toBe('\nWHERE "a" = @p0\n  AND "b" IS NULL');
    expect(out.params).toEqual([{ name: 'p0', value: 1 }]);
  });

  it('renders ORDER BY with multiple columns', () => {
    const sort: SortRule[] = [
      { column: 'date', direction: 'desc' },
      { column: 'amount', direction: 'asc' },
    ];
    expect(r.renderOrderBy(sort).sql).toBe('\nORDER BY\n  "date" DESC,\n  "amount" ASC');
  });

  it('renders LIMIT', () => {
    expect(r.renderLimit(100).sql).toBe('\nLIMIT 100');
    expect(r.renderLimit(0).sql).toBe('\nLIMIT 0');
  });

  it('rejects fractional, negative, NaN, and Infinity limits as defence-in-depth', () => {
    expect(() => r.renderLimit(10.7)).toThrow(/Invalid LIMIT value/);
    expect(() => r.renderLimit(-1)).toThrow(/Invalid LIMIT value/);
    expect(() => r.renderLimit(NaN)).toThrow(/Invalid LIMIT value/);
    expect(() => r.renderLimit(Infinity)).toThrow(/Invalid LIMIT value/);
  });

  it('omits LIMIT when null or undefined', () => {
    expect(r.renderLimit(null).sql).toBe('');
    expect(r.renderLimit(undefined).sql).toBe('');
  });

  describe('renderAggregateExpression — base throws for dialect-specific functions', () => {
    it('STRING_AGG throws "not supported for this storage"', () => {
      expect(() =>
        r.renderAggregatedSelect(['cat'], [{ column: 'cat', function: 'STRING_AGG' }])
      ).toThrow(/not supported for this storage/);
    });

    it('P50 throws "not supported for this storage"', () => {
      expect(() =>
        r.renderAggregatedSelect(['price'], [{ column: 'price', function: 'P50' }])
      ).toThrow(/not supported for this storage/);
    });
  });

  describe('renderAggregatedSelect — output naming, alias map', () => {
    it('aliases an aggregated metric to the suffixed label (FN argument stays the raw column)', () => {
      const out = r.renderAggregatedSelect(
        ['channel', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }]
      );
      expect(out.selectSql).toBe('"channel",\n  SUM("revenue") AS "revenue | SUM"');
      expect(out.groupBySql).toBe('\nGROUP BY\n  "channel"');
    });

    it('returns aliasByColumn mapping each projected column to its quoted output alias', () => {
      const out = r.renderAggregatedSelect(
        ['channel', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }]
      );
      expect(out.aliasByColumn.get('channel')).toBe('"channel"');
      expect(out.aliasByColumn.get('revenue')).toBe('"revenue | SUM"');
    });

    it('aliasByColumn maps a date-trunc dimension to its quoted plain column name', () => {
      const out = r.renderAggregatedSelect(
        ['date', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }],
        new Map([['date', 'MONTH']])
      );
      expect(out.aliasByColumn.get('date')).toBe('"date"');
      expect(out.aliasByColumn.get('revenue')).toBe('"revenue | SUM"');
    });

    it('buildAggregatedAliasResolver routes a metric to its suffixed alias and falls back to quoting', () => {
      const out = r.renderAggregatedSelect(
        ['channel', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }]
      );
      const resolver = r.buildAggregatedAliasResolver(out.aliasByColumn);
      expect(resolver('revenue')).toBe('"revenue | SUM"');
      expect(resolver('channel')).toBe('"channel"');
      expect(resolver('unknown')).toBe('"unknown"');
    });

    it('ORDER BY on a metric references the suffixed alias via the resolver', () => {
      const out = r.renderAggregatedSelect(
        ['channel', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }]
      );
      const orderBy = r.renderOrderBy(
        [{ column: 'revenue', direction: 'desc' }],
        r.buildAggregatedAliasResolver(out.aliasByColumn)
      );
      expect(orderBy.sql).toBe('\nORDER BY\n  "revenue | SUM" DESC');
    });
  });

  describe('renderAggregatedSelect — multiple functions on one column', () => {
    it('emits one SELECT item per function for a multi-aggregated column, in rule order', () => {
      const out = r.renderAggregatedSelect(
        ['date', 'amount'],
        [
          { column: 'amount', function: 'SUM' },
          { column: 'amount', function: 'AVG' },
        ]
      );
      expect(out.selectSql).toBe(
        '"date",\n  SUM("amount") AS "amount | SUM",\n  AVG("amount") AS "amount | AVG"'
      );
      // The lone dimension is the only GROUP BY key; a multi-aggregated column is never a key.
      expect(out.groupBySql).toBe('\nGROUP BY\n  "date"');
    });

    it('maps a multi-aggregated column to its FIRST function alias (ORDER BY resolves to it)', () => {
      const out = r.renderAggregatedSelect(
        ['date', 'amount'],
        [
          { column: 'amount', function: 'SUM' },
          { column: 'amount', function: 'AVG' },
        ]
      );
      expect(out.aliasByColumn.get('amount')).toBe('"amount | SUM"');
    });

    it('emits one item per function per column in qualified (blended) mode', () => {
      const qualify: ColumnRefResolver = column => `t."${column}"`;
      const out = r.renderAggregatedSelect(
        ['date', 'amount'],
        [
          { column: 'amount', function: 'SUM' },
          { column: 'amount', function: 'AVG' },
        ],
        undefined,
        { qualifyColumn: qualify }
      );
      expect(out.selectSql).toBe(
        't."date" AS "date",\n  SUM(t."amount") AS "amount | SUM",\n  AVG(t."amount") AS "amount | AVG"'
      );
      expect(out.groupBySql).toBe('\nGROUP BY\n  t."date"');
    });
  });

  describe('renderAggregatedSelect — qualified mode (blended post-join aggregation)', () => {
    const qualify: ColumnRefResolver = column => `t."${column}"`;

    it('qualifies the FN argument and keeps the output alias unqualified', () => {
      const out = r.renderAggregatedSelect(
        ['d', 'x'],
        [{ column: 'x', function: 'SUM' }],
        undefined,
        {
          qualifyColumn: qualify,
        }
      );
      expect(out.selectSql).toBe('t."d" AS "d",\n  SUM(t."x") AS "x | SUM"');
      expect(out.groupBySql).toBe('\nGROUP BY\n  t."d"');
    });

    it('aliases a plain dimension to its unqualified name (explicit AS in qualified mode)', () => {
      const out = r.renderAggregatedSelect(['d'], [], undefined, { qualifyColumn: qualify });
      expect(out.selectSql).toBe('t."d" AS "d"');
      expect(out.groupBySql).toBe('\nGROUP BY\n  t."d"');
    });

    it('truncates a qualified date-trunc dimension and groups by the qualified truncated expr', () => {
      const out = r.renderAggregatedSelect(
        ['d', 'x'],
        [{ column: 'x', function: 'SUM' }],
        new Map([['d', 'MONTH']]),
        { qualifyColumn: qualify }
      );
      expect(out.selectSql).toBe('DATE_TRUNC(t."d", MONTH) AS "d",\n  SUM(t."x") AS "x | SUM"');
      expect(out.groupBySql).toBe('\nGROUP BY\n  DATE_TRUNC(t."d", MONTH)');
    });

    it('aliasByColumn maps to the unqualified output alias in qualified mode', () => {
      const out = r.renderAggregatedSelect(
        ['d', 'x'],
        [{ column: 'x', function: 'SUM' }],
        undefined,
        {
          qualifyColumn: qualify,
        }
      );
      expect(out.aliasByColumn.get('d')).toBe('"d"');
      expect(out.aliasByColumn.get('x')).toBe('"x | SUM"');
    });
  });

  describe('column qualification via ColumnRefResolver', () => {
    const qualify: ColumnRefResolver = column => `main."${column}"`;

    it('passes the resolved column reference into WHERE fragments', () => {
      const out = r.renderWhere(
        [
          { column: 'a', operator: 'eq', value: 1 },
          { column: 'b', operator: 'is_empty' },
        ],
        qualify
      );
      expect(out.sql).toBe('\nWHERE main."a" = @p0\n  AND main."b" IS NULL');
    });

    it('passes the resolved column reference into ORDER BY fragments', () => {
      const out = r.renderOrderBy(
        [
          { column: 'date', direction: 'desc' },
          { column: 'amount', direction: 'asc' },
        ],
        qualify
      );
      expect(out.sql).toBe('\nORDER BY\n  main."date" DESC,\n  main."amount" ASC');
    });

    it('lets the resolver route different columns to different prefixes', () => {
      const routed: ColumnRefResolver = column =>
        column === 'b' ? `orders."${column}"` : `main."${column}"`;
      const out = r.renderWhere(
        [
          { column: 'a', operator: 'eq', value: 1 },
          { column: 'b', operator: 'eq', value: 2 },
        ],
        routed
      );
      expect(out.sql).toBe('\nWHERE main."a" = @p0\n  AND orders."b" = @p1');
    });
  });

  describe('renderAggregatedSelect — Unique Count (includeUniqueCount)', () => {
    it('single PK column → COUNT(DISTINCT col) appended, no GROUP BY key added', () => {
      const out = r.renderAggregatedSelect(
        ['channel', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }],
        undefined,
        { includeUniqueCount: true, primaryKeyColumns: ['session_id'] }
      );
      expect(out.selectSql).toContain(`COUNT(DISTINCT "session_id") AS "${UNIQUE_COUNT_LABEL}"`);
      expect(out.groupBySql).toBe('\nGROUP BY\n  "channel"');
    });

    it('composite PK → COUNT(DISTINCT CASE WHEN ... IS NULL ... THEN NULL ELSE CONCAT ... END) appended', () => {
      const out = r.renderAggregatedSelect(['channel'], [], undefined, {
        includeUniqueCount: true,
        primaryKeyColumns: ['c1', 'c2'],
      });
      expect(out.selectSql).toContain(
        `COUNT(DISTINCT CASE WHEN "c1" IS NULL OR "c2" IS NULL THEN NULL ELSE CONCAT(CAST(LENGTH(CAST("c1" AS STRING)) AS STRING), '␟', CAST("c1" AS STRING), CAST(LENGTH(CAST("c2" AS STRING)) AS STRING), '␟', CAST("c2" AS STRING)) END) AS "${UNIQUE_COUNT_LABEL}"`
      );
    });

    it('flag off → Unique Count NOT present', () => {
      const out = r.renderAggregatedSelect(['channel'], [], undefined, {
        includeUniqueCount: false,
        primaryKeyColumns: ['id'],
      });
      expect(out.selectSql).not.toContain(UNIQUE_COUNT_LABEL);
    });

    it('empty primaryKeyColumns → Unique Count NOT present', () => {
      const out = r.renderAggregatedSelect(['channel'], [], undefined, {
        includeUniqueCount: true,
        primaryKeyColumns: [],
      });
      expect(out.selectSql).not.toContain(UNIQUE_COUNT_LABEL);
    });

    it('Unique Count is appended after the projected dimensions', () => {
      const out = r.renderAggregatedSelect(['channel'], [], undefined, {
        includeUniqueCount: true,
        primaryKeyColumns: ['id'],
      });
      const dimIdx = out.selectSql.indexOf('"channel"');
      const ucIdx = out.selectSql.indexOf(UNIQUE_COUNT_LABEL);
      expect(dimIdx).toBeGreaterThan(-1);
      expect(ucIdx).toBeGreaterThan(dimIdx);
    });
  });

  // The composite-PK separator MUST be byte-identical across every dialect. A SQL
  // backslash-escape literal (`'␟'`) means U+241F on BigQuery/Databricks but the
  // 6 literal characters on Redshift/Snowflake/Athena → the composite key would collide
  // differently per engine. Assert every dialect emits the SAME raw separator and none
  // emits the backslash-escape form.
  describe('renderAggregatedSelect — composite-PK separator is identical across dialects', () => {
    const dialects: ReadonlyArray<[string, SqlClauseRenderer]> = [
      ['BigQuery', new BigQueryClauseRenderer()],
      ['Athena', new AthenaClauseRenderer()],
      ['Snowflake', new SnowflakeClauseRenderer()],
      ['Redshift', new RedshiftClauseRenderer()],
      ['Databricks', new DatabricksClauseRenderer()],
    ];

    const separatorOf = (renderer: SqlClauseRenderer): string => {
      const out = renderer.renderAggregatedSelect(['x'], [], undefined, {
        includeUniqueCount: true,
        primaryKeyColumns: ['c1', 'c2'],
      });
      // Capture the literal between the two CAST(...) parts. It sits in a CONCAT arg list
      // (`AS STRING), '<sep>', CAST`) on most dialects, or in a `||` chain
      // (`AS VARCHAR(65535)) || '<sep>' || CAST`) on Redshift — match either join form, and
      // either a bare type keyword or one carrying a length.
      const m = out.selectSql.match(/AS \w+(?:\(\d+\))?\)(?:, | \|\| )'([^']*)'(?:, | \|\| )CAST/);
      if (!m) throw new Error(`no composite-PK separator found in: ${out.selectSql}`);
      return m[1];
    };

    it('no dialect emits the backslash-escape form of the separator', () => {
      for (const [name, renderer] of dialects) {
        const sep = separatorOf(renderer);
        expect(`${name}: ${sep}`).not.toContain('\\u');
      }
    });

    it('all five dialects emit the exact same separator literal (the raw U+241F char)', () => {
      const seps = dialects.map(([, renderer]) => separatorOf(renderer));
      const unitSeparator = '␟'; // the actual unit-separator character, not the escape text
      for (const sep of seps) {
        expect(sep).toBe(unitSeparator);
      }
      expect(new Set(seps).size).toBe(1);
    });

    // A default would let a new dialect pass every single-key test — those never cast — and fail
    // in the warehouse on its first COMPOSITE key, where the cast keyword finally appears. There
    // is no keyword every SQL dialect agrees on, so each has to say its own (#6792).
    it('makes every dialect state its own text cast type instead of inheriting one', () => {
      expect(Object.getOwnPropertyNames(SqlClauseRenderer.prototype)).not.toContain('textCastType');
      for (const [name, renderer] of dialects) {
        const own = Object.getOwnPropertyNames(Object.getPrototypeOf(renderer));
        expect(`${name}: ${own.includes('textCastType')}`).toBe(`${name}: true`);
      }
    });
  });

  // Dialect-agnostic HAVING contract: the LHS is the aggregate EXPRESSION
  // (renderAggregateExpression), the default param prefix is `h` (distinct from
  // WHERE's `p`), the WHERE/HAVING split is driven by `rule.function`, and multiple
  // HAVING rules join with AND. The StubRenderer's `eq` fragment emits `@<param>`.
  describe('renderHaving — base contract', () => {
    it('renders the aggregate expression as the HAVING LHS with the default `h` prefix', () => {
      const out = r.renderHaving([
        { column: 'amount', function: 'SUM', operator: 'eq', value: 10 },
      ]);
      expect(out.sql).toBe('\nHAVING SUM("amount") = @h0');
      expect(out.params).toEqual([{ name: 'h0', value: 10 }]);
    });

    it('uses a param prefix (`h`) distinct from WHERE (`p`) on the same rule list', () => {
      const rules: FilterRule[] = [
        { column: 'country', operator: 'eq', value: 'US' },
        { column: 'amount', function: 'SUM', operator: 'eq', value: 10 },
      ];
      // WHERE takes only the no-function rule and uses `p`; HAVING takes only the
      // function rule and uses `h`.
      expect(r.renderWhere(rules).sql).toBe('\nWHERE "country" = @p0');
      expect(r.renderWhere(rules).params).toEqual([{ name: 'p0', value: 'US' }]);
      expect(r.renderHaving(rules).sql).toBe('\nHAVING SUM("amount") = @h0');
      expect(r.renderHaving(rules).params).toEqual([{ name: 'h0', value: 10 }]);
    });

    it('joins multiple HAVING rules with AND, each on its own line, advancing the index', () => {
      const out = r.renderHaving([
        { column: 'amount', function: 'SUM', operator: 'eq', value: 1 },
        { column: 'amount', function: 'AVG', operator: 'eq', value: 2 },
      ]);
      expect(out.sql).toBe('\nHAVING SUM("amount") = @h0\n  AND AVG("amount") = @h1');
      expect(out.params.map(p => p.name)).toEqual(['h0', 'h1']);
    });

    it('returns empty SQL when no rule carries a function (all are WHERE rules)', () => {
      expect(r.renderHaving([{ column: 'a', operator: 'eq', value: 1 }]).sql).toBe('');
    });
  });

  // renderHaving reuses renderFilterFragment, so the null-inclusive negative operators
  // apply to metric (HAVING) filters too — collateral but intended. The aggregate
  // EXPRESSION is the LHS, so it is emitted twice in the `(agg IS NULL OR agg …)` form.
  describe('renderHaving — negative operators are null-inclusive on metric filters', () => {
    it('neq metric filter → `(SUM(col) IS NULL OR SUM(col) <> @h0)` (real BigQuery renderer)', () => {
      const bq = new BigQueryClauseRenderer();
      const out = bq.renderHaving([
        { column: 'amount', function: 'SUM', operator: 'neq', value: 0 },
      ]);
      expect(out.sql).toBe('\nHAVING (SUM(`amount`) IS NULL OR SUM(`amount`) <> @h0)');
      expect(out.params).toEqual([{ name: 'h0', value: 0 }]);
    });

    it('not_contains metric filter emits the aggregate twice (real Athena renderer)', () => {
      const athena = new AthenaClauseRenderer();
      const out = athena.renderHaving([
        { column: 'name', function: 'MAX', operator: 'not_contains', value: 'x' },
      ]);
      expect(out.sql).toBe('\nHAVING (MAX("name") IS NULL OR strpos(MAX("name"), ?) = 0)');
      expect(out.params).toEqual([{ name: 'h0', value: 'x' }]);
    });
  });

  it('renderNullSafeJoinOn joins each pair NULL-safely with AND', () => {
    const sql = r.renderNullSafeJoinOn([
      { left: '"main"."country"', right: '"sleeve_x"."country"' },
      { left: '"main"."device"', right: '"sleeve_x"."device"' },
    ]);
    expect(sql).toBe(
      '("main"."country" = "sleeve_x"."country" OR ("main"."country" IS NULL AND "sleeve_x"."country" IS NULL)) ' +
        'AND ("main"."device" = "sleeve_x"."device" OR ("main"."device" IS NULL AND "sleeve_x"."device" IS NULL))'
    );
  });
});

// Terminal allow-list at the render boundary — the date-trunc unit and time zone are INLINED
// into SQL (no bound parameter), so this is the last gate before injection. Every dialect
// overrides renderDateTrunc, so the guard must fire for ALL of them, not just the base.
describe('renderDateTrunc — terminal injection guard (all dialects)', () => {
  const dialects: [string, SqlClauseRenderer][] = [
    ['BigQuery', new BigQueryClauseRenderer()],
    ['Athena', new AthenaClauseRenderer()],
    ['Redshift', new RedshiftClauseRenderer()],
    ['Snowflake', new SnowflakeClauseRenderer()],
    ['Databricks', new DatabricksClauseRenderer()],
  ];

  for (const [name, renderer] of dialects) {
    it(`${name}: rejects an out-of-enum date-trunc unit`, () => {
      expect(() =>
        renderer.renderAggregatedSelect(['d'], [], new Map([['d', 'DAY); DROP TABLE t--' as any]]))
      ).toThrow(/date.trunc unit/i);
    });

    it(`${name}: rejects a time zone that is not a valid IANA name`, () => {
      expect(() =>
        renderer.renderAggregatedSelect(['d'], [], new Map([['d', 'DAY']]), {
          timeZoneByColumn: new Map([['d', "UTC'); DROP TABLE t--"]]),
        })
      ).toThrow(/time zone/i);
    });

    it(`${name}: accepts a valid unit + IANA time zone`, () => {
      expect(() =>
        renderer.renderAggregatedSelect(['d'], [], new Map([['d', 'MONTH']]), {
          timeZoneByColumn: new Map([['d', 'America/New_York']]),
        })
      ).not.toThrow();
    });
  }
});

describe('renderNullSafeJoinOn — NaN-safe leg', () => {
  const renderer = new BigQueryClauseRenderer();

  it('emits the plain NULL-safe form for an unmarked pair', () => {
    expect(renderer.renderNullSafeJoinOn([{ left: 'a.x', right: 'b.x' }])).toBe(
      '(a.x = b.x OR (a.x IS NULL AND b.x IS NULL))'
    );
  });

  // GROUP BY buckets all NaNs together while `NaN = NaN` is FALSE on BigQuery and Trino, so a
  // float dimension holding NaN forms an outer group that matches no sleeve row — the metric
  // then reads NULL, or 0 once the COUNT DISTINCT pull coalesces.
  it('adds the NaN leg for a pair marked nanSafe', () => {
    expect(renderer.renderNullSafeJoinOn([{ left: 'a.x', right: 'b.x', nanSafe: true }])).toBe(
      '(a.x = b.x OR (a.x IS NULL AND b.x IS NULL) OR (a.x != a.x AND b.x != b.x))'
    );
  });
});

describe('Unique Count primary-key rendering (#6792)', () => {
  const renderer = new BigQueryClauseRenderer();

  it('keeps a single-column key byte-identical to the pre-#6792 form', () => {
    const out = renderer.renderAggregatedSelect(['channel'], [], undefined, {
      includeUniqueCount: true,
      primaryKeyColumns: ['id'],
    });
    expect(out.selectSql).toContain('COUNT(DISTINCT `id`)');
    expect(out.selectSql).not.toContain('CASE WHEN');
  });

  it('excludes rows with a NULL component from a composite key count', () => {
    const out = renderer.renderAggregatedSelect(['channel'], [], undefined, {
      includeUniqueCount: true,
      primaryKeyColumns: ['a', 'b'],
    });
    expect(out.selectSql).toContain('IS NULL OR');
    expect(out.selectSql).toContain('THEN NULL ELSE');
    expect(out.selectSql).not.toContain('COALESCE');
  });
});
