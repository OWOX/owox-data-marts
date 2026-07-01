import { AthenaClauseRenderer } from './athena-clause-renderer';
import { REPORT_AGGREGATE_FUNCTION_TOKENS } from '../../../dto/schemas/aggregation-labels';
import { UNIQUE_COUNT_LABEL } from '../../../dto/schemas/aggregation-labels';

describe('AthenaClauseRenderer — percentile and STRING_AGG aggregations', () => {
  const r = new AthenaClauseRenderer();

  it('P50 metric with one dimension produces APPROX_PERCENTILE with fraction 0.5', () => {
    const out = r.renderAggregatedSelect(
      ['channel', 'price'],
      [{ column: 'price', function: 'P50' }]
    );
    expect(out.selectSql).toBe('"channel",\n  APPROX_PERCENTILE("price", 0.5) AS "price | MEDIAN"');
    expect(out.groupBySql).toBe('\nGROUP BY\n  "channel"');
  });

  it('P25/P75/P95 use correct fractions', () => {
    for (const [fn, fraction] of [
      ['P25', 0.25],
      ['P75', 0.75],
      ['P95', 0.95],
    ] as const) {
      const out = r.renderAggregatedSelect(['col'], [{ column: 'col', function: fn }]);
      expect(out.selectSql).toBe(
        `APPROX_PERCENTILE("col", ${fraction}) AS "col | ${REPORT_AGGREGATE_FUNCTION_TOKENS[fn]}"`
      );
    }
  });

  it('STRING_AGG casts the column to text so a non-string column produces valid SQL', () => {
    const out = r.renderAggregatedSelect(['cat'], [{ column: 'cat', function: 'STRING_AGG' }]);
    expect(out.selectSql).toBe(
      `array_join(array_agg(CAST("cat" AS VARCHAR)), ', ') AS "cat | STRINGAGG"`
    );
  });

  // Athena (Trino) does not guarantee ANY_VALUE across engine versions; arbitrary() is the safe form.
  it('ANY_VALUE renders arbitrary(col) (ANY_VALUE is not all-version-safe on Trino)', () => {
    const out = r.renderAggregatedSelect(['name'], [{ column: 'name', function: 'ANY_VALUE' }]);
    expect(out.selectSql).toBe(`arbitrary("name") AS "name | ANYVALUE"`);
    expect(out.selectSql).not.toContain('ANY_VALUE');
  });

  it('date-trunc MONTH dimension with a SUM metric truncates and groups by the truncated expr', () => {
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

  it('date-trunc MONTH with a timeZone applies AT TIME ZONE before truncating', () => {
    const out = r.renderAggregatedSelect(
      ['date', 'revenue'],
      [{ column: 'revenue', function: 'SUM' }],
      new Map([['date', 'MONTH']]),
      { timeZoneByColumn: new Map([['date', 'America/New_York']]) }
    );
    expect(out.selectSql).toBe(
      `date_trunc('month', "date" AT TIME ZONE 'America/New_York') AS "date",\n` +
        `  SUM("revenue") AS "revenue | SUM"`
    );
    expect(out.groupBySql).toBe(
      `\nGROUP BY\n  date_trunc('month', "date" AT TIME ZONE 'America/New_York')`
    );
  });

  // The bucket carries the rule's IANA tz (AT TIME ZONE 'tz') but a relative_date filter on the
  // SAME column compares against current_date in the DB session zone — the tz is never threaded
  // into the WHERE clause. Lock that asymmetry so a future change can't silently tz one side only.
  it('a tz bucket and a relative_date filter on the same column do NOT share the tz', () => {
    const agg = r.renderAggregatedSelect(['date'], [], new Map([['date', 'MONTH']]), {
      timeZoneByColumn: new Map([['date', 'America/New_York']]),
    });
    expect(agg.selectSql).toContain("AT TIME ZONE 'America/New_York'");

    const where = r.renderWhere([
      { column: 'date', operator: 'relative_date', value: { kind: 'this_month' } },
    ]);
    expect(where.sql).not.toContain('America/New_York');
    expect(where.sql).toContain('current_date');
  });

  // FE only offers a tz for sub-day types, and the validator rejects tz-on-DATE upstream
  // (DATE_TRUNC_TIMEZONE_REQUIRES_TIMESTAMP). The renderer is type-blind, so lock the SQL it
  // emits either way: a tz adds AT TIME ZONE, the no-tz case stays a plain date_trunc.
  describe('date-trunc tz vs column type (renderer is type-blind)', () => {
    it('no tz on a DATE-typed column → plain date_trunc, no AT TIME ZONE', () => {
      const out = r.renderAggregatedSelect(['date'], [], new Map([['date', 'MONTH']]));
      expect(out.selectSql).toBe(`date_trunc('month', "date") AS "date"`);
      expect(out.selectSql).not.toContain('AT TIME ZONE');
    });

    it('tz on a TIMESTAMP-typed column → AT TIME ZONE shifts before truncating', () => {
      const out = r.renderAggregatedSelect(['ts'], [], new Map([['ts', 'DAY']]), {
        timeZoneByColumn: new Map([['ts', 'America/New_York']]),
      });
      expect(out.selectSql).toBe(`date_trunc('day', "ts" AT TIME ZONE 'America/New_York') AS "ts"`);
    });
  });

  it('appends COUNT(*) AS "Row Count" as the last select item', () => {
    const out = r.renderAggregatedSelect(
      ['channel', 'revenue'],
      [{ column: 'revenue', function: 'SUM' }],
      undefined,
      { includeRowCount: true }
    );
    expect(out.selectSql).toBe(
      '"channel",\n  SUM("revenue") AS "revenue | SUM",\n  COUNT(*) AS "Row Count"'
    );
    expect(out.groupBySql).toBe('\nGROUP BY\n  "channel"');
  });

  // Grand-total shape (what composeTotals produces): all-metrics, no dimensions, Row Count
  // appended → a single all-aggregated row, so there is NO GROUP BY.
  it('all metrics, no dimensions, with Row Count → no GROUP BY clause', () => {
    const out = r.renderAggregatedSelect(
      ['revenue', 'orders'],
      [
        { column: 'revenue', function: 'SUM' },
        { column: 'orders', function: 'COUNT_DISTINCT' },
      ],
      undefined,
      { includeRowCount: true }
    );
    expect(out.selectSql).toBe(
      'SUM("revenue") AS "revenue | SUM",\n' +
        '  COUNT(DISTINCT "orders") AS "orders | COUNTUNIQUE",\n' +
        '  COUNT(*) AS "Row Count"'
    );
    expect(out.groupBySql).toBe('');
  });

  describe('renderHaving — aggregate-expression LHS (positional `?` params)', () => {
    it('renders a plain SUM aggregate as the HAVING LHS with a positional placeholder', () => {
      const out = r.renderHaving([
        { column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 },
      ]);
      expect(out.sql).toBe('\nHAVING SUM("revenue") > ?');
      expect(out.params).toEqual([{ name: 'h0', value: 1000 }]);
    });

    it('renders COUNT(DISTINCT ...) for a COUNT_DISTINCT HAVING rule', () => {
      const out = r.renderHaving([
        { column: 'id', function: 'COUNT_DISTINCT', operator: 'gte', value: 5 },
      ]);
      expect(out.sql).toBe('\nHAVING COUNT(DISTINCT "id") >= ?');
      expect(out.params).toEqual([{ name: 'h0', value: 5 }]);
    });

    it('reuses APPROX_PERCENTILE for a percentile (P50) HAVING LHS', () => {
      const out = r.renderHaving([{ column: 'price', function: 'P50', operator: 'gt', value: 42 }]);
      expect(out.sql).toBe('\nHAVING APPROX_PERCENTILE("price", 0.5) > ?');
      expect(out.params).toEqual([{ name: 'h0', value: 42 }]);
    });
  });

  describe('Unique Count — Athena (double-quote quotes, VARCHAR cast type)', () => {
    it('single PK → COUNT(DISTINCT "col") AS "Unique Count"', () => {
      const out = r.renderAggregatedSelect(['channel'], [], undefined, {
        includeUniqueCount: true,
        primaryKeyColumns: ['session_id'],
      });
      expect(out.selectSql).toContain(`COUNT(DISTINCT "session_id") AS "${UNIQUE_COUNT_LABEL}"`);
    });

    it('composite PK → CONCAT with VARCHAR cast type, double-quote quotes', () => {
      const out = r.renderAggregatedSelect(['channel'], [], undefined, {
        includeUniqueCount: true,
        primaryKeyColumns: ['c1', 'c2'],
      });
      expect(out.selectSql).toContain(
        `COUNT(DISTINCT CONCAT(COALESCE(CAST("c1" AS VARCHAR), ''), '␟', COALESCE(CAST("c2" AS VARCHAR), ''))) AS "${UNIQUE_COUNT_LABEL}"`
      );
    });
  });
});
