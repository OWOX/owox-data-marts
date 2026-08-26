import { SnowflakeClauseRenderer } from './snowflake-clause-renderer';
import { REPORT_AGGREGATE_FUNCTION_TOKENS } from '../../../dto/schemas/aggregation-labels';
import { UNIQUE_COUNT_LABEL } from '../../../dto/schemas/aggregation-labels';
import type { ReportAggregateFunction } from '../../../dto/schemas/aggregate-function.schema';

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
    // wraps the WHOLE substituted formula in this dialect's own spelling (uppercase unit, unlike
    // Trino's). No CAST — its `DATE_INPUT_FORMAT` defaults to AUTO and its measured failures carry
    // the same MDY signature Redshift's wrong month did, so it is the likeliest second one.
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
        '"channel",\n  DATE_TRUNC(\'MONTH\', DATE("visit_ts")) AS "visit_day"'
      );
      expect(out.groupByParts).toEqual(['"channel"', 'DATE_TRUNC(\'MONTH\', DATE("visit_ts"))']);
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
        `LISTAGG(CAST((${EXPR}) AS VARCHAR), ', ') AS "session_key | STRINGAGG"`
      );
      expect(out.groupByParts).toEqual(['"channel"']);
      expect(out.groupBySql).toBe('\nGROUP BY\n  "channel"');
    });

    // Snowflake already answered `12.75` on probe shape 8a, UNCAST — so here the cast
    // has nothing to repair and everything to preserve, and the shapes that would have measured
    // it (8c/8d) are the cells the warehouse's daily credit cap left unrun. Its three spellings
    // are documentation-only until a live pass runs them.
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

      // FLOAT stays FLOAT: Snowflake's is already 64-bit, so there is no narrowing to avoid here
      // the way there is on Athena's REAL or Spark's FLOAT.
      it('SUM casts to the declared FLOAT, which is already this dialect 64-bit float', () => {
        expect(selectFor('SUM', 'FLOAT')).toBe(
          `SUM(CAST((${NUM_EXPR}) AS FLOAT)) AS "amount | SUM"`
        );
      });

      // NUMERIC is a synonym of NUMBER, whose default is (38,0) — an unqualified cast target
      // would truncate every fraction, which is the defect this cast exists to remove.
      it('spells the scale on a NUMERIC declaration instead of inheriting NUMBER (38,0)', () => {
        expect(selectFor('AVG', 'NUMERIC')).toBe(
          `AVG(CAST((${NUM_EXPR}) AS NUMERIC(38,18))) AS "amount | AVG"`
        );
      });

      it('casts inside PERCENTILE_CONT, which reads the value as a number too', () => {
        expect(selectFor('P50', 'FLOAT')).toBe(
          `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CAST((${NUM_EXPR}) AS FLOAT)) ` +
            `AS "amount | MEDIAN"`
        );
      });

      // Same numeric declaration throughout, so a function wrongly added to the arithmetic set
      // shows up as a second, nested CAST rather than as nothing.
      it('leaves COUNT_DISTINCT, MIN/MAX, LISTAGG and ANY_VALUE with the SQL they emit today', () => {
        expect(selectFor('COUNT_DISTINCT', 'FLOAT')).toContain(`COUNT(DISTINCT (${NUM_EXPR}))`);
        expect(selectFor('MIN', 'FLOAT')).toContain(`MIN((${NUM_EXPR}))`);
        expect(selectFor('MAX', 'FLOAT')).toContain(`MAX((${NUM_EXPR}))`);
        expect(selectFor('STRING_AGG', 'FLOAT')).toContain(
          `LISTAGG(CAST((${NUM_EXPR}) AS VARCHAR), ', ')`
        );
        expect(selectFor('ANY_VALUE', 'FLOAT')).toContain(`ANY_VALUE((${NUM_EXPR}))`);
      });

      // The no-op half, and the one that matters most on this dialect: the SQL that already
      // returned 12.75 must not move under a declaration with no cast target.
      it('emits no cast for a declared type this dialect states no target for', () => {
        expect(selectFor('SUM', 'VARCHAR')).toBe(`SUM((${NUM_EXPR})) AS "amount | SUM"`);
      });

      // An INTEGER declaration is refused a cast although this dialect states a target for
      // it. `CAST(x AS INTEGER)` resolves to NUMBER(38,0) here, so casting would round every row
      // before summing — a per-row conversion the warehouse was not making.
      it('never casts an INTEGER declaration, though the mapping states a target for it', () => {
        expect(r.castTypeForDeclaredType('INTEGER')).toBe('INTEGER');
        expect(selectFor('SUM', 'INTEGER')).toBe(`SUM((${NUM_EXPR})) AS "amount | SUM"`);
      });
    });
  });
});
