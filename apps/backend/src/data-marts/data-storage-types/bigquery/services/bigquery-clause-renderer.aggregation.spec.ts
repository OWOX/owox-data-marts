import { BigQueryClauseRenderer } from './bigquery-clause-renderer';
import { REPORT_AGGREGATE_FUNCTION_TOKENS } from '../../../dto/schemas/aggregation-labels';
import { UNIQUE_COUNT_LABEL } from '../../../dto/schemas/aggregation-labels';

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
      'SUM(`revenue`) AS `revenue | SUM`,\n' +
        '  COUNT(DISTINCT `orders`) AS `orders | COUNTUNIQUE`,\n' +
        '  COUNT(*) AS `Row Count`'
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

  it('appends COUNT(*) AS `Row Count` as the last select item', () => {
    const out = r.renderAggregatedSelect(
      ['channel', 'revenue'],
      [{ column: 'revenue', function: 'SUM' }],
      undefined,
      { includeRowCount: true }
    );
    expect(out.selectSql).toBe(
      '`channel`,\n  SUM(`revenue`) AS `revenue | SUM`,\n  COUNT(*) AS `Row Count`'
    );
    expect(out.groupBySql).toBe('\nGROUP BY\n  `channel`');
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
        `COUNT(DISTINCT CONCAT(COALESCE(CAST(\`c1\` AS STRING), ''), '␟', COALESCE(CAST(\`c2\` AS STRING), ''))) AS \`${UNIQUE_COUNT_LABEL}\``
      );
    });
  });
});
