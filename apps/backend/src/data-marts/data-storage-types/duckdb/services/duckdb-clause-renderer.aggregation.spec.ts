import { DuckDbClauseRenderer } from './duckdb-clause-renderer';
import { REPORT_AGGREGATE_FUNCTION_TOKENS } from '../../../dto/schemas/aggregation-labels';
import { UNIQUE_COUNT_LABEL } from '../../../dto/schemas/aggregation-labels';

describe('DuckDbClauseRenderer — percentile, STRING_AGG, and date-trunc aggregations', () => {
  const r = new DuckDbClauseRenderer();

  it('P50 metric with one dimension produces quantile_cont with fraction 0.5', () => {
    const out = r.renderAggregatedSelect(
      ['channel', 'price'],
      [{ column: 'price', function: 'P50' }]
    );
    expect(out.selectSql).toBe('"channel",\n  quantile_cont("price", 0.5) AS "price | MEDIAN"');
    expect(out.groupBySql).toBe('\nGROUP BY\n  "channel"');
  });

  it('P25/P75/P95 use correct fractions (DuckDB quantile_cont rejects a 0-100 value)', () => {
    for (const [fn, fraction] of [
      ['P25', 0.25],
      ['P75', 0.75],
      ['P95', 0.95],
    ] as const) {
      const out = r.renderAggregatedSelect(['col'], [{ column: 'col', function: fn }]);
      expect(out.selectSql).toBe(
        `quantile_cont("col", ${fraction}) AS "col | ${REPORT_AGGREGATE_FUNCTION_TOKENS[fn]}"`
      );
    }
  });

  it('STRING_AGG casts the column to VARCHAR so a non-string column produces valid SQL', () => {
    const out = r.renderAggregatedSelect(['cat'], [{ column: 'cat', function: 'STRING_AGG' }]);
    expect(out.selectSql).toBe(`string_agg(CAST("cat" AS VARCHAR), ', ') AS "cat | STRINGAGG"`);
  });

  it('ANY_VALUE renders ANY_VALUE(col) (base default; valid DuckDB)', () => {
    const out = r.renderAggregatedSelect(['name'], [{ column: 'name', function: 'ANY_VALUE' }]);
    expect(out.selectSql).toBe('ANY_VALUE("name") AS "name | ANYVALUE"');
  });

  it('date-trunc MONTH dimension with a SUM metric truncates (lowercase unit) and groups by it', () => {
    const out = r.renderAggregatedSelect(
      ['date', 'revenue'],
      [{ column: 'revenue', function: 'SUM' }],
      new Map([['date', 'MONTH']])
    );
    expect(out.selectSql).toBe(
      `date_trunc('month', "date") AS "date",\n  SUM("revenue") AS "revenue | SUM"`
    );
    expect(out.groupBySql).toBe(`\nGROUP BY\n  date_trunc('month', "date")`);
  });

  it('date-trunc-only (no metric) groups by the truncated dimension', () => {
    const out = r.renderAggregatedSelect(['date'], [], new Map([['date', 'QUARTER']]));
    expect(out.selectSql).toBe(`date_trunc('quarter', "date") AS "date"`);
    expect(out.groupBySql).toBe(`\nGROUP BY\n  date_trunc('quarter', "date")`);
  });

  // DuckDB now shifts the column into the target zone before truncating, like every
  // other dialect (Athena/BigQuery/Databricks/Redshift/Snowflake) — via a DOUBLE
  // `AT TIME ZONE` shift (live-verified against DuckDB semantics; see the renderDateTrunc
  // comment and duckdb-clause-renderer.tz.spec.ts for the boundary-instant oracle).
  it('date-trunc MONTH with a timeZone shifts the column via a double AT TIME ZONE', () => {
    const out = r.renderAggregatedSelect(
      ['date', 'revenue'],
      [{ column: 'revenue', function: 'SUM' }],
      new Map([['date', 'MONTH']]),
      { timeZoneByColumn: new Map([['date', 'America/New_York']]) }
    );
    expect(out.selectSql).toBe(
      `date_trunc('month', (("date") AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York') AS "date",\n  SUM("revenue") AS "revenue | SUM"`
    );
    expect(out.groupBySql).toBe(
      `\nGROUP BY\n  date_trunc('month', (("date") AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York')`
    );
  });

  it('date-trunc MONTH with no timeZone stays a plain date_trunc (no AT TIME ZONE)', () => {
    const out = r.renderAggregatedSelect(
      ['date', 'revenue'],
      [{ column: 'revenue', function: 'SUM' }],
      new Map([['date', 'MONTH']])
    );
    expect(out.selectSql).toBe(
      `date_trunc('month', "date") AS "date",\n  SUM("revenue") AS "revenue | SUM"`
    );
    expect(out.selectSql).not.toContain('AT TIME ZONE');
  });

  it('still rejects an invalid/malicious IANA time zone before it ever reaches the expression (defense in depth)', () => {
    expect(() =>
      r.renderAggregatedSelect(['date'], [], new Map([['date', 'MONTH']]), {
        timeZoneByColumn: new Map([['date', "x'; DROP TABLE t; --"]]),
      })
    ).toThrow(/Invalid IANA time zone/);
  });

  // Grand-total shape (what composeTotals produces): all-metrics, no dimensions
  // -> a single all-aggregated row, so there is NO GROUP BY.
  it('all metrics, no dimensions -> no GROUP BY clause', () => {
    const out = r.renderAggregatedSelect(
      ['revenue', 'orders'],
      [
        { column: 'revenue', function: 'SUM' },
        { column: 'orders', function: 'COUNT_DISTINCT' },
      ]
    );
    expect(out.selectSql).toBe(
      'SUM("revenue") AS "revenue | SUM",\n  ' +
        'COUNT(DISTINCT "orders") AS "orders | COUNTUNIQUE"'
    );
    expect(out.groupBySql).toBe('');
  });

  describe('renderHaving — aggregate-expression LHS (inlined literals, zero params)', () => {
    it('renders a plain SUM aggregate as the HAVING LHS with an inlined literal', () => {
      const out = r.renderHaving([
        { column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 },
      ]);
      expect(out.sql).toBe('\nHAVING SUM("revenue") > 1000');
      expect(out.params).toEqual([]);
    });

    it('renders COUNT(DISTINCT ...) for a COUNT_DISTINCT HAVING rule', () => {
      const out = r.renderHaving([
        { column: 'id', function: 'COUNT_DISTINCT', operator: 'gte', value: 5 },
      ]);
      expect(out.sql).toBe('\nHAVING COUNT(DISTINCT "id") >= 5');
      expect(out.params).toEqual([]);
    });

    it('reuses quantile_cont for a percentile (P50) HAVING LHS', () => {
      const out = r.renderHaving([{ column: 'price', function: 'P50', operator: 'gt', value: 42 }]);
      expect(out.sql).toBe('\nHAVING quantile_cont("price", 0.5) > 42');
      expect(out.params).toEqual([]);
    });
  });

  describe('Unique Count — DuckDB (double-quote quotes, VARCHAR cast type, N-ary CONCAT)', () => {
    it('single PK -> COUNT(DISTINCT "col") AS "Unique Count"', () => {
      const out = r.renderAggregatedSelect(['channel'], [], undefined, {
        includeUniqueCount: true,
        primaryKeyColumns: ['session_id'],
      });
      expect(out.selectSql).toContain(`COUNT(DISTINCT "session_id") AS "${UNIQUE_COUNT_LABEL}"`);
    });

    it('composite PK -> length-prefixed CONCAT with VARCHAR cast type, double-quote quotes (DuckDB CONCAT is N-ary)', () => {
      const out = r.renderAggregatedSelect(['channel'], [], undefined, {
        includeUniqueCount: true,
        primaryKeyColumns: ['c1', 'c2'],
      });
      expect(out.selectSql).toContain(
        `COUNT(DISTINCT CASE WHEN "c1" IS NULL OR "c2" IS NULL THEN NULL ELSE CONCAT(CAST(LENGTH(CAST("c1" AS VARCHAR)) AS VARCHAR), '␟', CAST("c1" AS VARCHAR), CAST(LENGTH(CAST("c2" AS VARCHAR)) AS VARCHAR), '␟', CAST("c2" AS VARCHAR)) END) AS "${UNIQUE_COUNT_LABEL}"`
      );
    });
  });
});
