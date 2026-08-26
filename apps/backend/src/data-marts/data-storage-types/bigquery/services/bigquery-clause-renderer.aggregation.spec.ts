import { BigQueryClauseRenderer } from './bigquery-clause-renderer';
import { REPORT_AGGREGATE_FUNCTION_TOKENS } from '../../../dto/schemas/aggregation-labels';
import { UNIQUE_COUNT_LABEL } from '../../../dto/schemas/aggregation-labels';
import type { ReportAggregateFunction } from '../../../dto/schemas/aggregate-function.schema';

describe('BigQueryClauseRenderer — aggregated select + group by', () => {
  const r = new BigQueryClauseRenderer();

  it('SUM metric with one dimension groups by the dimension', () => {
    const out = r.renderAggregatedSelect(
      ['channel', 'revenue'],
      [{ column: 'revenue', function: 'SUM' }]
    );
    expect(out.selectSql).toBe('`channel`,\n  SUM(`revenue`) AS `revenue | SUM`');
    expect(out.groupBySql).toBe('\nGROUP BY\n  `channel`');
  });

  it('COUNT_DISTINCT renders COUNT(DISTINCT col)', () => {
    const out = r.renderAggregatedSelect(
      ['date', 'sessionId'],
      [{ column: 'sessionId', function: 'COUNT_DISTINCT' }]
    );
    expect(out.selectSql).toBe(
      '`date`,\n  COUNT(DISTINCT `sessionId`) AS `sessionId | COUNTUNIQUE`'
    );
    expect(out.groupBySql).toBe('\nGROUP BY\n  `date`');
  });

  it('AVG is supported', () => {
    const out = r.renderAggregatedSelect(['day', 'price'], [{ column: 'price', function: 'AVG' }]);
    expect(out.selectSql).toBe('`day`,\n  AVG(`price`) AS `price | AVG`');
    expect(out.groupBySql).toBe('\nGROUP BY\n  `day`');
  });

  it('all columns aggregated → no GROUP BY clause', () => {
    const out = r.renderAggregatedSelect(['revenue'], [{ column: 'revenue', function: 'SUM' }]);
    expect(out.selectSql).toBe('SUM(`revenue`) AS `revenue | SUM`');
    expect(out.groupBySql).toBe('');
  });

  // A nested/struct column: the aggregate argument keeps the dotted struct reference, but the
  // output ALIAS sanitizes the dots (BigQuery rejects a dot in an alias). Header comes from
  // the same label, so they match.
  it('nested/struct metric → struct-ref argument, dot-free single-token alias', () => {
    const out = r.renderAggregatedSelect(
      ['metrics.revenue'],
      [{ column: 'metrics.revenue', function: 'SUM' }]
    );
    expect(out.selectSql).toBe('SUM(`metrics`.`revenue`) AS `metrics_revenue | SUM`');
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
      'SUM(`revenue`) AS `revenue | SUM`,\n' +
        '  COUNT(DISTINCT `orders`) AS `orders | COUNTUNIQUE`'
    );
    expect(out.groupBySql).toBe('');
  });

  it('multiple dimensions and multiple metrics', () => {
    const out = r.renderAggregatedSelect(
      ['date', 'channel', 'revenue', 'orders'],
      [
        { column: 'revenue', function: 'SUM' },
        { column: 'orders', function: 'COUNT' },
      ]
    );
    expect(out.selectSql).toBe(
      '`date`,\n' +
        '  `channel`,\n' +
        '  SUM(`revenue`) AS `revenue | SUM`,\n' +
        '  COUNT(`orders`) AS `orders | COUNT`'
    );
    expect(out.groupBySql).toBe('\nGROUP BY\n  `date`,\n  `channel`');
  });

  it('P50 metric with one dimension produces APPROX_QUANTILES with OFFSET(50)', () => {
    const out = r.renderAggregatedSelect(
      ['channel', 'price'],
      [{ column: 'price', function: 'P50' }]
    );
    expect(out.selectSql).toBe(
      '`channel`,\n  APPROX_QUANTILES(`price`, 100)[OFFSET(50)] AS `price | MEDIAN`'
    );
    expect(out.groupBySql).toBe('\nGROUP BY\n  `channel`');
  });

  it('P25/P75/P95 use correct OFFSET', () => {
    for (const [fn, offset] of [
      ['P25', 25],
      ['P75', 75],
      ['P95', 95],
    ] as const) {
      const out = r.renderAggregatedSelect(['col'], [{ column: 'col', function: fn }]);
      expect(out.selectSql).toBe(
        `APPROX_QUANTILES(\`col\`, 100)[OFFSET(${offset})] AS \`col | ${REPORT_AGGREGATE_FUNCTION_TOKENS[fn]}\``
      );
    }
  });

  it('STRING_AGG casts the column to text so a non-string column produces valid SQL', () => {
    const out = r.renderAggregatedSelect(['cat'], [{ column: 'cat', function: 'STRING_AGG' }]);
    expect(out.selectSql).toBe("STRING_AGG(CAST(`cat` AS STRING), ', ') AS `cat | STRINGAGG`");
  });

  it('ANY_VALUE renders ANY_VALUE(col) (natively supported on BigQuery)', () => {
    const out = r.renderAggregatedSelect(['name'], [{ column: 'name', function: 'ANY_VALUE' }]);
    expect(out.selectSql).toBe('ANY_VALUE(`name`) AS `name | ANYVALUE`');
  });

  it('date-trunc MONTH dimension with a SUM metric truncates and groups by the truncated expr', () => {
    const out = r.renderAggregatedSelect(
      ['date', 'revenue'],
      [{ column: 'revenue', function: 'SUM' }],
      new Map([['date', 'MONTH']])
    );
    expect(out.selectSql).toBe(
      'DATE_TRUNC(DATE(`date`), MONTH) AS `date`,\n  SUM(`revenue`) AS `revenue | SUM`'
    );
    expect(out.groupBySql).toBe('\nGROUP BY\n  DATE_TRUNC(DATE(`date`), MONTH)');
  });

  it('date-trunc-only (no metric) groups by the truncated dimension', () => {
    const out = r.renderAggregatedSelect(['date'], [], new Map([['date', 'QUARTER']]));
    expect(out.selectSql).toBe('DATE_TRUNC(DATE(`date`), QUARTER) AS `date`');
    expect(out.groupBySql).toBe('\nGROUP BY\n  DATE_TRUNC(DATE(`date`), QUARTER)');
  });

  it('date-trunc WEEK with a plain dimension and a metric', () => {
    const out = r.renderAggregatedSelect(
      ['date', 'channel', 'revenue'],
      [{ column: 'revenue', function: 'SUM' }],
      new Map([['date', 'WEEK']])
    );
    expect(out.selectSql).toBe(
      'DATE_TRUNC(DATE(`date`), WEEK) AS `date`,\n' +
        '  `channel`,\n' +
        '  SUM(`revenue`) AS `revenue | SUM`'
    );
    expect(out.groupBySql).toBe('\nGROUP BY\n  DATE_TRUNC(DATE(`date`), WEEK),\n  `channel`');
  });

  it('date-trunc MONTH with a timeZone converts to that zone before truncating', () => {
    const out = r.renderAggregatedSelect(
      ['date', 'revenue'],
      [{ column: 'revenue', function: 'SUM' }],
      new Map([['date', 'MONTH']]),
      { timeZoneByColumn: new Map([['date', 'America/New_York']]) }
    );
    expect(out.selectSql).toBe(
      "DATE_TRUNC(DATE(`date`, 'America/New_York'), MONTH) AS `date`,\n" +
        '  SUM(`revenue`) AS `revenue | SUM`'
    );
    expect(out.groupBySql).toBe(
      "\nGROUP BY\n  DATE_TRUNC(DATE(`date`, 'America/New_York'), MONTH)"
    );
  });

  // The bucket carries the rule's IANA tz (DATE(col, 'tz')) but a relative_date filter on the
  // SAME column compares against CURRENT_DATE() in the DB session zone — the tz is never threaded
  // into the WHERE clause. Lock that asymmetry so a future change can't silently tz one side only.
  it('a tz bucket and a relative_date filter on the same column do NOT share the tz', () => {
    const agg = r.renderAggregatedSelect(['date'], [], new Map([['date', 'MONTH']]), {
      timeZoneByColumn: new Map([['date', 'America/New_York']]),
    });
    expect(agg.selectSql).toBe("DATE_TRUNC(DATE(`date`, 'America/New_York'), MONTH) AS `date`");

    const where = r.renderWhere([
      { column: 'date', operator: 'relative_date', value: { kind: 'this_month' } },
    ]);
    expect(where.sql).not.toContain('America/New_York');
    expect(where.sql).toContain('CURRENT_DATE()');
  });

  // FE only offers a tz for sub-day types, and the validator rejects tz-on-DATE upstream
  // The renderer is type-aware (verified on real BigQuery — see PR #1373 review): a DATE
  // column needs no DATE() wrap (DATE_TRUNC takes a DATE directly), TIMESTAMP / tz-less
  // DATETIME wrap in DATE(), and a tz-naive DATETIME WITH tz routes through TIMESTAMP()
  // because DATE(DATETIME, tz) has no overload. With no type info it falls back to DATE(col).
  describe('date-trunc tz vs column type (type-aware)', () => {
    it('DATE-typed column → DATE_TRUNC(col) with no redundant DATE() wrap', () => {
      const out = r.renderAggregatedSelect(['date'], [], new Map([['date', 'MONTH']]), {
        typeByColumn: new Map([['date', 'DATE']]),
      });
      expect(out.selectSql).toBe('DATE_TRUNC(`date`, MONTH) AS `date`');
    });

    it('tz on a TIMESTAMP-typed column → DATE(col, tz) converts before truncating', () => {
      const out = r.renderAggregatedSelect(['ts'], [], new Map([['ts', 'DAY']]), {
        timeZoneByColumn: new Map([['ts', 'America/New_York']]),
        typeByColumn: new Map([['ts', 'TIMESTAMP']]),
      });
      expect(out.selectSql).toBe("DATE_TRUNC(DATE(`ts`, 'America/New_York'), DAY) AS `ts`");
    });

    it('tz on a tz-naive DATETIME column → normalized via TIMESTAMP()', () => {
      const out = r.renderAggregatedSelect(['dt'], [], new Map([['dt', 'MONTH']]), {
        timeZoneByColumn: new Map([['dt', 'America/New_York']]),
        typeByColumn: new Map([['dt', 'DATETIME']]),
      });
      expect(out.selectSql).toBe(
        "DATE_TRUNC(DATE(TIMESTAMP(`dt`, 'America/New_York'), 'America/New_York'), MONTH) AS `dt`"
      );
    });

    it('no type info → DATE(col) fallback (valid for TIMESTAMP / tz-less DATETIME)', () => {
      const out = r.renderAggregatedSelect(['date'], [], new Map([['date', 'MONTH']]));
      expect(out.selectSql).toBe('DATE_TRUNC(DATE(`date`), MONTH) AS `date`');
    });
  });

  describe('Unique Count — BigQuery (backtick quotes, STRING cast type)', () => {
    it('single PK → COUNT(DISTINCT `col`) AS `Unique Count`', () => {
      const out = r.renderAggregatedSelect(['channel'], [], undefined, {
        includeUniqueCount: true,
        primaryKeyColumns: ['session_id'],
      });
      expect(out.selectSql).toContain(
        `COUNT(DISTINCT \`session_id\`) AS \`${UNIQUE_COUNT_LABEL}\``
      );
    });

    it('composite PK → CONCAT with STRING cast type, backtick quotes', () => {
      const out = r.renderAggregatedSelect(['channel'], [], undefined, {
        includeUniqueCount: true,
        primaryKeyColumns: ['c1', 'c2'],
      });
      expect(out.selectSql).toContain(
        `COUNT(DISTINCT CASE WHEN \`c1\` IS NULL OR \`c2\` IS NULL THEN NULL ELSE CONCAT(CAST(LENGTH(CAST(\`c1\` AS STRING)) AS STRING), '␟', CAST(\`c1\` AS STRING), CAST(LENGTH(CAST(\`c2\` AS STRING)) AS STRING), '␟', CAST(\`c2\` AS STRING)) END) AS \`${UNIQUE_COUNT_LABEL}\``
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
      type: 'STRING',
      formula: 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})',
      level: 'column' as const,
    };
    const EXPR = 'CONCAT(`session_id`, `user_id`)';

    it('projects and groups by the same expression, appended after the column keys', () => {
      const out = r.renderAggregatedSelect(
        ['channel', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }],
        undefined,
        { calculatedFields: [rowLevel] }
      );

      expect(out.selectSql).toContain(`${EXPR} AS \`session_key\``);
      expect(out.groupBySql).toBe(`\nGROUP BY\n  \`channel\`,\n  ${EXPR}`);
      expect(out.groupByParts).toEqual(['`channel`', EXPR]);
      expect(out.aliasByColumn.get('session_key')).toBe('`session_key`');
    });

    it('projects it with no grouping contribution on the plain path', () => {
      expect(r.renderCalculatedSelectItems([rowLevel])).toEqual([`${EXPR} AS \`session_key\``]);
    });

    // BigQuery is the ONE dialect whose `renderDateTrunc` reads a type at all,
    // and a calculated field has no warehouse column to read one from — so the plan's own declared
    // type is what must reach it. A DATE declaration takes the no-wrap branch; drop the argument
    // and the same formula comes back as `DATE_TRUNC(DATE(DATE(…)), MONTH)`.
    describe('bucketed by date', () => {
      const VISIT_EXPR = 'DATE(`visit_ts`)';
      const visitDay = {
        outputName: 'visit_day',
        type: 'DATE',
        formula: 'DATE({{ref field="visit_ts"}})',
        level: 'column' as const,
      };

      it('truncates the whole expression, with the DECLARED type deciding the wrap', () => {
        const out = r.renderAggregatedSelect(
          ['channel'],
          [],
          new Map([['visit_day', 'MONTH' as const]]),
          { calculatedFields: [visitDay] }
        );

        expect(out.selectSql).toBe(
          `\`channel\`,\n  DATE_TRUNC(${VISIT_EXPR}, MONTH) AS \`visit_day\``
        );
        expect(out.groupByParts).toEqual(['`channel`', `DATE_TRUNC(${VISIT_EXPR}, MONTH)`]);
      });

      it('converts to the rule time zone first on a TIMESTAMP declaration', () => {
        const out = r.renderAggregatedSelect([], [], new Map([['visit_day', 'DAY' as const]]), {
          calculatedFields: [{ ...visitDay, type: 'TIMESTAMP' }],
          timeZoneByColumn: new Map([['visit_day', 'America/New_York']]),
        });

        expect(out.selectSql).toBe(
          `DATE_TRUNC(DATE(${VISIT_EXPR}, 'America/New_York'), DAY) AS \`visit_day\``
        );
      });

      // The anti-drift pin the metric sleeve rests on, asserted where the type argument is
      // actually load-bearing: the sleeve derives this key OUTSIDE this class and joins back on it,
      // so both sides must reach it through the two public seats with the PLAN's declared type. On
      // this dialect a type read from anywhere else is a visibly different string, not a subtle one.
      it('reaches the same key through the two public seats the sleeve calls', () => {
        const out = r.renderAggregatedSelect([], [], new Map([['visit_day', 'MONTH' as const]]), {
          calculatedFields: [visitDay],
        });

        expect(out.groupByParts[0]).toBe(
          r.renderDateTruncExpression(
            r.renderRowLevelDimensionExpression(visitDay, {}),
            'MONTH',
            undefined,
            visitDay.type
          )
        );
      });

      // The measured core: a `CAST` before the truncation turned a loud Redshift refusal into a
      // confidently wrong month, so none is emitted on any dialect however the field is declared.
      it('adds no CAST, whatever the declared type', () => {
        for (const type of ['DATE', 'TIMESTAMP', 'STRING', 'FLOAT']) {
          const out = r.renderAggregatedSelect([], [], new Map([['visit_day', 'MONTH' as const]]), {
            calculatedFields: [{ ...visitDay, type }],
          });
          expect(out.selectSql).not.toMatch(/CAST/);
        }
      });
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

      expect(out.selectSql).toContain(`COUNT(DISTINCT (${EXPR})) AS \`session_key | COUNTUNIQUE\``);
      // The dialect's own STRING_AGG spelling, over the PARENTHESISED expression.
      expect(out.selectSql).toContain(
        `STRING_AGG(CAST((${EXPR}) AS STRING), ', ') AS \`session_key | STRINGAGG\``
      );
      expect(out.groupByParts).toEqual(['`channel`']);
      expect(out.groupBySql).toBe('\nGROUP BY\n  `channel`');
    });

    // On BigQuery this is the dialect where the fix makes a query that RAISES today
    // start returning a number — not a regression, the declared type finally reaching the
    // warehouse. Probe shape 8a (`SUM((CONCAT(…)))`) answered `No matching signature for
    // aggregate function SUM / Argument types: STRING`, and 8c substituting the declared name
    // VERBATIM answered `Type not found: FLOAT` — which is why the cast target is FLOAT64 and why
    // the mapping has to be per dialect at all.
    describe('the declared type, imposed where the aggregation does arithmetic', () => {
      // The probe's fixture: two string columns concatenated to '10.5' and '2.25'. True SUM 12.75.
      const NUM_EXPR = 'CONCAT(`num_prefix`, `num_suffix`)';
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

      it('SUM over a numeric-looking string STARTS WORKING: the declared FLOAT becomes FLOAT64', () => {
        expect(selectFor('SUM', 'FLOAT')).toBe(
          `SUM(CAST((${NUM_EXPR}) AS FLOAT64)) AS \`amount | SUM\``
        );
      });

      // BigQuery is the one dialect whose exact types must stay BARE: it rejects every
      // parameterized type in a CAST, so harmonising these with the other four dialects'
      // `(38,18)` would turn this query into a hard error rather than a wrong number.
      it('keeps NUMERIC unparameterized, which this dialect requires in a CAST', () => {
        expect(selectFor('AVG', 'NUMERIC')).toBe(
          `AVG(CAST((${NUM_EXPR}) AS NUMERIC)) AS \`amount | AVG\``
        );
      });

      it('casts inside APPROX_QUANTILES, which reads the value as a number too', () => {
        expect(selectFor('P50', 'FLOAT')).toBe(
          `APPROX_QUANTILES(CAST((${NUM_EXPR}) AS FLOAT64), 100)[OFFSET(50)] AS \`amount | MEDIAN\``
        );
      });

      // Same numeric declaration throughout, so a function wrongly added to the arithmetic set
      // shows up as a second, nested CAST rather than as nothing.
      it('leaves COUNT_DISTINCT, MIN/MAX, STRING_AGG and ANY_VALUE with the SQL they emit today', () => {
        expect(selectFor('COUNT_DISTINCT', 'FLOAT')).toContain(`COUNT(DISTINCT (${NUM_EXPR}))`);
        expect(selectFor('MIN', 'FLOAT')).toContain(`MIN((${NUM_EXPR}))`);
        expect(selectFor('MAX', 'FLOAT')).toContain(`MAX((${NUM_EXPR}))`);
        expect(selectFor('STRING_AGG', 'FLOAT')).toContain(
          `STRING_AGG(CAST((${NUM_EXPR}) AS STRING), ', ')`
        );
        expect(selectFor('ANY_VALUE', 'FLOAT')).toContain(`ANY_VALUE((${NUM_EXPR}))`);
      });

      // The no-op half: a declaration this dialect states no cast target for emits exactly the
      // SQL it emits today — here, the one that raises.
      it('emits no cast for a declared type this dialect states no target for', () => {
        expect(selectFor('SUM', 'STRING')).toBe(`SUM((${NUM_EXPR})) AS \`amount | SUM\``);
      });

      // An INTEGER declaration is refused a cast although this dialect states `INT64` for
      // it. `CAST(1.5 AS INT64)` ROUNDS here and Spark's equivalent TRUNCATES, so casting would
      // make the same report return a different total per warehouse — on top of introducing a
      // per-row conversion where the warehouse was making none.
      it('never casts an INTEGER declaration, though the mapping states INT64 for it', () => {
        expect(r.castTypeForDeclaredType('INTEGER')).toBe('INT64');
        expect(selectFor('SUM', 'INTEGER')).toBe(`SUM((${NUM_EXPR})) AS \`amount | SUM\``);
      });
    });
  });
});
