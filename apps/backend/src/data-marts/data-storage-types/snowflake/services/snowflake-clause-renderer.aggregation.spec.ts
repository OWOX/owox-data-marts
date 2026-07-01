import { SnowflakeClauseRenderer } from './snowflake-clause-renderer';
import { REPORT_AGGREGATE_FUNCTION_TOKENS } from '../../../dto/schemas/aggregation-labels';
import { UNIQUE_COUNT_LABEL } from '../../../dto/schemas/aggregation-labels';

describe('SnowflakeClauseRenderer — percentile and STRING_AGG aggregations', () => {
  const r = new SnowflakeClauseRenderer();

  it('P50 metric with one dimension produces PERCENTILE_CONT with fraction 0.5', () => {
    const out = r.renderAggregatedSelect(
      ['channel', 'price'],
      [{ column: 'price', function: 'P50' }]
    );
    expect(out.selectSql).toBe(
      '"channel",\n  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "price") AS "price | MEDIAN"'
    );
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
        `PERCENTILE_CONT(${fraction}) WITHIN GROUP (ORDER BY "col") AS "col | ${REPORT_AGGREGATE_FUNCTION_TOKENS[fn]}"`
      );
    }
  });

  it('STRING_AGG casts the column to text so a non-string column produces valid SQL', () => {
    const out = r.renderAggregatedSelect(['cat'], [{ column: 'cat', function: 'STRING_AGG' }]);
    expect(out.selectSql).toBe(`LISTAGG(CAST("cat" AS VARCHAR), ', ') AS "cat | STRINGAGG"`);
  });

  it('ANY_VALUE renders ANY_VALUE(col) (natively supported on Snowflake)', () => {
    const out = r.renderAggregatedSelect(['name'], [{ column: 'name', function: 'ANY_VALUE' }]);
    expect(out.selectSql).toBe('ANY_VALUE("name") AS "name | ANYVALUE"');
  });

  it('date-trunc MONTH dimension with a SUM metric truncates and groups by the truncated expr', () => {
    const out = r.renderAggregatedSelect(
      ['date', 'revenue'],
      [{ column: 'revenue', function: 'SUM' }],
      new Map([['date', 'MONTH']])
    );
    expect(out.selectSql).toBe(
      `DATE_TRUNC('MONTH', "date") AS "date",\n  SUM("revenue") AS "revenue | SUM"`
    );
    expect(out.groupBySql).toBe(`\nGROUP BY\n  DATE_TRUNC('MONTH', "date")`);
  });

  it('date-trunc-only (no metric) groups by the truncated dimension', () => {
    const out = r.renderAggregatedSelect(['date'], [], new Map([['date', 'QUARTER']]));
    expect(out.selectSql).toBe(`DATE_TRUNC('QUARTER', "date") AS "date"`);
    expect(out.groupBySql).toBe(`\nGROUP BY\n  DATE_TRUNC('QUARTER', "date")`);
  });

  it('date-trunc MONTH with a timeZone wraps the column in CONVERT_TIMEZONE', () => {
    const out = r.renderAggregatedSelect(
      ['date', 'revenue'],
      [{ column: 'revenue', function: 'SUM' }],
      new Map([['date', 'MONTH']]),
      { timeZoneByColumn: new Map([['date', 'America/New_York']]) }
    );
    expect(out.selectSql).toBe(
      `DATE_TRUNC('MONTH', CONVERT_TIMEZONE('America/New_York', "date")) AS "date",\n  ` +
        `SUM("revenue") AS "revenue | SUM"`
    );
    expect(out.groupBySql).toBe(
      `\nGROUP BY\n  DATE_TRUNC('MONTH', CONVERT_TIMEZONE('America/New_York', "date"))`
    );
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
      'SUM("revenue") AS "revenue | SUM",\n  ' +
        'COUNT(DISTINCT "orders") AS "orders | COUNTUNIQUE",\n  ' +
        'COUNT(*) AS "Row Count"'
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

    it('reuses PERCENTILE_CONT for a percentile (P50) HAVING LHS', () => {
      const out = r.renderHaving([{ column: 'price', function: 'P50', operator: 'gt', value: 42 }]);
      expect(out.sql).toBe('\nHAVING PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "price") > 42');
      expect(out.params).toEqual([]);
    });
  });

  describe('Unique Count — Snowflake (double-quote quotes, VARCHAR cast type)', () => {
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
