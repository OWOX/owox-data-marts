import { AthenaClauseRenderer } from './athena-clause-renderer';
import { REPORT_AGGREGATE_FUNCTION_TOKENS } from '../../../dto/schemas/aggregation-labels';
import { UNIQUE_COUNT_LABEL } from '../../../dto/schemas/aggregation-labels';
import type { ReportAggregateFunction } from '../../../dto/schemas/aggregate-function.schema';

describe('AthenaClauseRenderer — percentile and STRING_AGG aggregations', () => {
  const r = new AthenaClauseRenderer();

  it('P50 metric with one dimension produces APPROX_PERCENTILE with fraction 0.5', () => {
    const out = r.renderAggregatedSelect(
      ['channel', 'price'],
      [{ column: 'price', function: 'P50' }]
    );
    expect(out.selectSql).toBe(
      '"channel",\n  APPROX_PERCENTILE(CAST("price" AS DOUBLE), 0.5) AS "price | MEDIAN"'
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
        `APPROX_PERCENTILE(CAST("col" AS DOUBLE), ${fraction}) AS "col | ${REPORT_AGGREGATE_FUNCTION_TOKENS[fn]}"`
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
      `date_trunc('month', ("date") AT TIME ZONE 'America/New_York') AS "date",\n` +
        `  SUM("revenue") AS "revenue | SUM"`
    );
    expect(out.groupBySql).toBe(
      `\nGROUP BY\n  date_trunc('month', ("date") AT TIME ZONE 'America/New_York')`
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
      expect(out.selectSql).toBe(
        `date_trunc('day', ("ts") AT TIME ZONE 'America/New_York') AS "ts"`
      );
    });
  });

  // Athena is the one dialect that splices its operand into a POSTFIX operator instead of into a
  // function's parentheses, and Trino binds `AT TIME ZONE` TIGHTER than `+ - * /` and `||` — so a
  // bare `a || b AT TIME ZONE 'tz'` shifts `b` alone and truncates a value nobody asked for. The
  // seat is public (`renderDateTruncExpression`) and takes a whole rendered expression, e.g. a
  // calculated field's formula, so the operand is parenthesised here rather than at each caller.
  it('parenthesises a compound operand so AT TIME ZONE cannot re-associate it', () => {
    const expr = r.renderDateTruncExpression(`"ts" + INTERVAL '1' HOUR`, 'DAY', 'America/New_York');
    expect(expr).toBe(
      `date_trunc('day', ("ts" + INTERVAL '1' HOUR) AT TIME ZONE 'America/New_York')`
    );
  });

  // Grand-total shape (what composeTotals produces): all-metrics, no dimensions
  // → a single all-aggregated row, so there is NO GROUP BY.
  it('all metrics, no dimensions → no GROUP BY clause', () => {
    const out = r.renderAggregatedSelect(
      ['revenue', 'orders'],
      [
        { column: 'revenue', function: 'SUM' },
        { column: 'orders', function: 'COUNT_DISTINCT' },
      ]
    );
    expect(out.selectSql).toBe(
      'SUM("revenue") AS "revenue | SUM",\n' +
        '  COUNT(DISTINCT "orders") AS "orders | COUNTUNIQUE"'
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
      expect(out.sql).toBe('\nHAVING APPROX_PERCENTILE(CAST("price" AS DOUBLE), 0.5) > ?');
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
        `COUNT(DISTINCT CASE WHEN "c1" IS NULL OR "c2" IS NULL THEN NULL ELSE CONCAT(CAST(LENGTH(CAST("c1" AS VARCHAR)) AS VARCHAR), '␟', CAST("c1" AS VARCHAR), CAST(LENGTH(CAST("c2" AS VARCHAR)) AS VARCHAR), '␟', CAST("c2" AS VARCHAR)) END) AS "${UNIQUE_COUNT_LABEL}"`
      );
    });
  });

  // A row-level calculated field is a dimension: its rendered expression is BYTE-IDENTICAL in
  // SELECT and GROUP BY, and it lands after every column key. Pinned per dialect because
  // the quoting the two sides share is this dialect's, and a drift between them is a warehouse
  // error no stub renderer can show.
  describe('a ROW-LEVEL calculated field', () => {
    const rowLevel = {
      outputName: 'session_key',
      type: 'VARCHAR',
      formula: 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})',
      level: 'column' as const,
    };
    const EXPR = 'CONCAT("session_id", "user_id")';

    it('projects and groups by the same expression, appended after the column keys', () => {
      const out = r.renderAggregatedSelect(
        ['channel', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }],
        undefined,
        { calculatedFields: [rowLevel] }
      );

      expect(out.selectSql).toContain(`${EXPR} AS "session_key"`);
      expect(out.groupBySql).toBe(`\nGROUP BY\n  "channel",\n  ${EXPR}`);
      expect(out.groupByParts).toEqual(['"channel"', EXPR]);
      expect(out.aliasByColumn.get('session_key')).toBe('"session_key"');
    });

    it('projects it with no grouping contribution on the plain path', () => {
      expect(r.renderCalculatedSelectItems([rowLevel])).toEqual([`${EXPR} AS "session_key"`]);
    });

    // A DATE-declared row-level field may be bucketed, and the truncation
    // wraps the WHOLE substituted formula in this dialect's own spelling. No CAST — the probe
    // measured one turning a loud refusal into a wrong month on Redshift, so none is emitted here
    // either; Athena is the dialect that refuses the mis-declared shape outright instead.
    it('truncates the whole expression with this dialect spelling, and no CAST', () => {
      const visitDay = {
        outputName: 'visit_day',
        type: 'DATE',
        formula: 'DATE({{ref field="visit_ts"}})',
        level: 'column' as const,
      };
      const out = r.renderAggregatedSelect(
        ['channel'],
        [],
        new Map([['visit_day', 'MONTH' as const]]),
        { calculatedFields: [visitDay] }
      );

      expect(out.selectSql).toBe(
        '"channel",\n  date_trunc(\'month\', DATE("visit_ts")) AS "visit_day"'
      );
      expect(out.groupByParts).toEqual(['"channel"', 'date_trunc(\'month\', DATE("visit_ts"))']);
      expect(out.selectSql).not.toMatch(/CAST/);
    });

    // Once the report aggregates it, it leaves the grouping keys entirely. Kept as a key
    // it emits `COUNT(DISTINCT expr) … GROUP BY expr` — 1 on every row, no error, on any
    // warehouse. Per dialect because the aggregate spelling AND the alias quoting are this one's.
    it('aggregates it under the labelled alias and drops it from the grouping keys', () => {
      const out = r.renderAggregatedSelect(
        ['channel'],
        [
          { column: 'session_key', function: 'COUNT_DISTINCT' },
          { column: 'session_key', function: 'STRING_AGG' },
        ],
        undefined,
        { calculatedFields: [{ ...rowLevel, isAggregatedByReport: true }] }
      );

      expect(out.selectSql).toContain(`COUNT(DISTINCT (${EXPR})) AS "session_key | COUNTUNIQUE"`);
      // The dialect's own STRING_AGG spelling, over the PARENTHESISED expression.
      expect(out.selectSql).toContain(
        `array_join(array_agg(CAST((${EXPR}) AS VARCHAR)), ', ') AS "session_key | STRINGAGG"`
      );
      expect(out.groupByParts).toEqual(['"channel"']);
      expect(out.groupBySql).toBe('\nGROUP BY\n  "channel"');
    });

    // Athena is the second dialect where the fix makes a query that RAISES today start
    // returning a number — not a regression, the declared type finally reaching the warehouse.
    // Probe shape 8a answered `FUNCTION_NOT_FOUND: Unexpected parameters (varchar) for function
    // sum`; shape 8c, the same query with the cast, measured `12.75` live.
    describe('the declared type, imposed where the aggregation does arithmetic', () => {
      // The probe's fixture: two string columns concatenated to '10.5' and '2.25'. True SUM 12.75.
      const NUM_EXPR = 'CONCAT("num_prefix", "num_suffix")';
      const numericText = {
        outputName: 'amount',
        formula: 'CONCAT({{ref field="num_prefix"}}, {{ref field="num_suffix"}})',
        level: 'column' as const,
        isAggregatedByReport: true,
      };
      const selectFor = (fn: ReportAggregateFunction, type: string): string =>
        r.renderAggregatedSelect([], [{ column: 'amount', function: fn }], undefined, {
          calculatedFields: [{ ...numericText, type }],
        }).selectSql;

      // The declared name is the Glue/DDL vocabulary and Trino has no FLOAT at all, so the target
      // is DOUBLE — which also refuses to narrow a formula that already computes in 64 bits.
      it('SUM over a numeric-looking string STARTS WORKING: the declared FLOAT becomes DOUBLE', () => {
        expect(selectFor('SUM', 'FLOAT')).toBe(
          `SUM(CAST((${NUM_EXPR}) AS DOUBLE)) AS "amount | SUM"`
        );
      });

      // A bare DECIMAL is (38,0) in Trino, so an unqualified cast target would truncate every
      // fraction — the same defect this cast exists to remove.
      it('spells the scale on a DECIMAL declaration instead of truncating inside the cast', () => {
        expect(selectFor('AVG', 'DECIMAL')).toBe(
          `AVG(CAST((${NUM_EXPR}) AS DECIMAL(38,18))) AS "amount | AVG"`
        );
      });

      // Two casts, and neither is redundant: the OUTER DOUBLE is Trino's own signature for
      // approx_percentile, the INNER one is the analyst's declaration deciding what value is
      // being converted — without it a DECIMAL-declared field is read straight off the varchar.
      it('casts inside APPROX_PERCENTILE, under the DOUBLE this dialect signature requires', () => {
        expect(selectFor('P50', 'DECIMAL')).toBe(
          `APPROX_PERCENTILE(CAST(CAST((${NUM_EXPR}) AS DECIMAL(38,18)) AS DOUBLE), 0.5) ` +
            `AS "amount | MEDIAN"`
        );
      });

      // Same numeric declaration throughout, so a function wrongly added to the arithmetic set
      // shows up as a second, nested CAST rather than as nothing.
      it('leaves COUNT_DISTINCT, MIN/MAX, array_agg and arbitrary with the SQL they emit today', () => {
        expect(selectFor('COUNT_DISTINCT', 'DOUBLE')).toContain(`COUNT(DISTINCT (${NUM_EXPR}))`);
        expect(selectFor('MIN', 'DOUBLE')).toContain(`MIN((${NUM_EXPR}))`);
        expect(selectFor('MAX', 'DOUBLE')).toContain(`MAX((${NUM_EXPR}))`);
        expect(selectFor('STRING_AGG', 'DOUBLE')).toContain(
          `array_join(array_agg(CAST((${NUM_EXPR}) AS VARCHAR)), ', ')`
        );
        expect(selectFor('ANY_VALUE', 'DOUBLE')).toContain(`arbitrary((${NUM_EXPR}))`);
      });

      // The no-op half: a declaration this dialect states no cast target for emits exactly the
      // SQL it emits today — here, the one that raises.
      it('emits no cast for a declared type this dialect states no target for', () => {
        expect(selectFor('SUM', 'VARCHAR')).toBe(`SUM((${NUM_EXPR})) AS "amount | SUM"`);
      });

      // The whole integer family is refused a cast although this dialect states targets for
      // all four. Casting would introduce a per-row conversion the warehouse was not making, and
      // Trino ROUNDS where Spark truncates — the same report, two totals.
      it('never casts the integer family, though the mapping states targets for it', () => {
        expect(r.castTypeForDeclaredType('BIGINT')).toBe('BIGINT');
        for (const declared of ['TINYINT', 'SMALLINT', 'INTEGER', 'BIGINT']) {
          expect(selectFor('SUM', declared)).toBe(`SUM((${NUM_EXPR})) AS "amount | SUM"`);
        }
      });
    });
  });
});
