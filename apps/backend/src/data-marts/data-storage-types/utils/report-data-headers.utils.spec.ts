import { resolveReportDataHeaders } from './report-data-headers.utils';
import { ReportDataHeader } from '../../dto/domain/report-data-header.dto';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { BigQueryFieldType } from '../bigquery/enums/bigquery-field-type.enum';
import {
  ROW_COUNT_LABEL,
  UNIQUE_COUNT_LABEL,
  aggregatedColumnLabel,
} from '../../dto/schemas/aggregation-labels';
import { BigQueryClauseRenderer } from '../bigquery/services/bigquery-clause-renderer';

const BQ = DataStorageType.GOOGLE_BIGQUERY;

describe('resolveReportDataHeaders', () => {
  it('returns native headers unchanged when no filter and no aggregation config', () => {
    const native = [
      new ReportDataHeader('channel', undefined, undefined, BigQueryFieldType.STRING),
      new ReportDataHeader('revenue', undefined, undefined, BigQueryFieldType.INTEGER),
    ];
    expect(resolveReportDataHeaders(native, undefined, BQ)).toBe(native);
  });

  it('filters to the columnFilter order when set (non-aggregated)', () => {
    const native = [
      new ReportDataHeader('a', undefined, undefined, BigQueryFieldType.STRING),
      new ReportDataHeader('b', undefined, undefined, BigQueryFieldType.STRING),
    ];
    const out = resolveReportDataHeaders(native, { columnFilter: ['b', 'a'] }, BQ);
    expect(out.map(h => h.name)).toEqual(['b', 'a']);
  });

  describe('aggregated columns', () => {
    const native = [
      new ReportDataHeader('channel', undefined, undefined, BigQueryFieldType.STRING),
      new ReportDataHeader('revenue', undefined, undefined, BigQueryFieldType.INTEGER),
    ];

    it('renames an aggregated header to the suffixed label, sets effective type + aggregateFunction', () => {
      const out = resolveReportDataHeaders(
        native,
        {
          columnFilter: ['channel', 'revenue'],
          aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
        },
        BQ
      );
      const channel = out.find(h => h.name === 'channel');
      expect(channel?.aggregateFunction).toBeUndefined();
      expect(channel?.storageFieldType).toBe(BigQueryFieldType.STRING);

      const revenue = out.find(h => h.name === aggregatedColumnLabel('revenue', 'SUM'));
      expect(revenue).toBeDefined();
      expect(revenue?.aggregateFunction).toBe('SUM');
      // SUM passes the raw type through.
      expect(revenue?.storageFieldType).toBe(BigQueryFieldType.INTEGER);
    });

    it('AVG widens the effective type to the float type', () => {
      const out = resolveReportDataHeaders(
        native,
        {
          columnFilter: ['channel', 'revenue'],
          aggregationConfig: [{ column: 'revenue', function: 'AVG' }],
        },
        BQ
      );
      const revenue = out.find(h => h.name === aggregatedColumnLabel('revenue', 'AVG'));
      expect(revenue?.storageFieldType).toBe(BigQueryFieldType.FLOAT);
    });

    it('percentile aggregation populates the header aggregateFunction (widened type)', () => {
      const out = resolveReportDataHeaders(
        native,
        {
          columnFilter: ['channel', 'revenue'],
          aggregationConfig: [{ column: 'revenue', function: 'P95' }],
        },
        BQ
      );
      const revenue = out.find(h => h.name === aggregatedColumnLabel('revenue', 'P95'));
      expect(revenue?.aggregateFunction).toBe('P95');
      expect(revenue?.storageFieldType).toBe(BigQueryFieldType.FLOAT);
    });

    it('the renamed header name equals the SQL alias (invariant — name-based row mapping)', () => {
      const out = resolveReportDataHeaders(
        native,
        {
          columnFilter: ['channel', 'revenue'],
          aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
        },
        BQ
      );
      // The renderer aliases SUM(`revenue`) to aggregatedColumnLabel('revenue','SUM');
      // COUNT(*) produces ROW_COUNT_LABEL; a result row keyed by those aliases must find
      // its header by name.
      const row: Record<string, unknown> = {
        channel: 'paid',
        [aggregatedColumnLabel('revenue', 'SUM')]: 42,
        [ROW_COUNT_LABEL]: 10,
      };
      for (const header of out) {
        expect(header.name in row).toBe(true);
      }
    });

    it('expands one column with two functions into two headers, in rule order, with effective types (Row Count appended last)', () => {
      const out = resolveReportDataHeaders(
        native,
        {
          columnFilter: ['channel', 'revenue'],
          aggregationConfig: [
            { column: 'revenue', function: 'SUM' },
            { column: 'revenue', function: 'AVG' },
          ],
        },
        BQ
      );
      // Row Count is appended last because aggregationConfig is non-empty.
      expect(out.map(h => h.name)).toEqual([
        'channel',
        aggregatedColumnLabel('revenue', 'SUM'),
        aggregatedColumnLabel('revenue', 'AVG'),
        ROW_COUNT_LABEL,
      ]);
      const sum = out.find(h => h.name === aggregatedColumnLabel('revenue', 'SUM'));
      const avg = out.find(h => h.name === aggregatedColumnLabel('revenue', 'AVG'));
      expect(sum?.aggregateFunction).toBe('SUM');
      expect(sum?.storageFieldType).toBe(BigQueryFieldType.INTEGER);
      expect(avg?.aggregateFunction).toBe('AVG');
      expect(avg?.storageFieldType).toBe(BigQueryFieldType.FLOAT);
    });

    it('multi-function header names equal the SQL aliases the renderer emits (round-trip)', () => {
      const renderer = new BigQueryClauseRenderer();
      const agg = renderer.renderAggregatedSelect(
        ['channel', 'revenue'],
        [
          { column: 'revenue', function: 'SUM' },
          { column: 'revenue', function: 'AVG' },
        ]
      );
      // The renderer emits two distinct aliases; each must have a matching header by name.
      const headers = resolveReportDataHeaders(
        native,
        {
          columnFilter: ['channel', 'revenue'],
          aggregationConfig: [
            { column: 'revenue', function: 'SUM' },
            { column: 'revenue', function: 'AVG' },
          ],
        },
        BQ
      );
      // Filter out Row Count (COUNT function) — it is always appended but not part of the
      // per-column SQL alias round-trip being checked here.
      const aggregatedNames = headers
        .filter(h => h.aggregateFunction && h.name !== ROW_COUNT_LABEL)
        .map(h => `\`${h.name}\``);
      expect(aggregatedNames).toEqual([
        agg.selectSql.match(/AS (`revenue \| SUM`)/)![1],
        agg.selectSql.match(/AS (`revenue \| AVG`)/)![1],
      ]);
    });

    it('a blended aggregated column header name equals the SQL alias the renderer emits', () => {
      // Round-trip: the blended builder aggregates via renderAggregatedSelect in
      // qualified mode; the header path renames the same column via aggregationConfig.
      // Both derive from aggregatedColumnLabel, so the names must match exactly.
      const renderer = new BigQueryClauseRenderer();
      const agg = renderer.renderAggregatedSelect(
        ['channel', 'partner__cost'],
        [{ column: 'partner__cost', function: 'SUM' }],
        undefined,
        { qualifyColumn: c => `t.\`${c}\`` }
      );
      const sqlAlias = agg.aliasByColumn.get('partner__cost');

      const blendedHeader = new ReportDataHeader(
        'partner__cost',
        'Partner cost',
        undefined,
        BigQueryFieldType.INTEGER
      );
      const out = resolveReportDataHeaders(
        [],
        {
          columnFilter: ['channel', 'partner__cost'],
          aggregationConfig: [{ column: 'partner__cost', function: 'SUM' }],
          blendedDataHeaders: [blendedHeader],
        },
        BQ
      );
      const aggregated = out.find(h => h.aggregateFunction === 'SUM');
      expect(aggregated).toBeDefined();
      // SQL alias is quoted; the header name is the bare label. Strip the backticks.
      expect(`\`${aggregated!.name}\``).toBe(sqlAlias);
    });

    it('a joined-numeric column with a supplied blended header keeps its base type (SUM passthrough)', () => {
      // Totals over a JOINED numeric field: the column is absent from native headers, so its
      // base type must come from blendedDataHeaders. A SUM passthrough must carry that type.
      const blendedHeader = new ReportDataHeader(
        'partner__cost',
        'Partner cost',
        undefined,
        BigQueryFieldType.FLOAT
      );
      const out = resolveReportDataHeaders(
        [],
        {
          columnFilter: ['partner__cost'],
          aggregationConfig: [{ column: 'partner__cost', function: 'SUM' }],
          blendedDataHeaders: [blendedHeader],
          rowCount: false,
        },
        BQ
      );
      const aggregated = out.find(h => h.aggregateFunction === 'SUM');
      expect(aggregated?.storageFieldType).toBe(BigQueryFieldType.FLOAT);
    });

    it('an unknown aggregated column (no native/blended header) yields undefined type, not a forced lie', () => {
      // Defence-in-depth for the removed non-null assertion: with no base type the effective
      // type is genuinely unknown and must surface as undefined rather than being forced.
      const out = resolveReportDataHeaders(
        [],
        {
          columnFilter: ['mystery'],
          aggregationConfig: [{ column: 'mystery', function: 'SUM' }],
          rowCount: false,
        },
        BQ
      );
      const aggregated = out.find(h => h.aggregateFunction === 'SUM');
      expect(aggregated).toBeDefined();
      expect(aggregated?.storageFieldType).toBeUndefined();
    });
  });

  describe('Row Count — automatic when aggregated', () => {
    const native = [
      new ReportDataHeader('channel', undefined, undefined, BigQueryFieldType.STRING),
    ];
    const nativeWithMetric = [
      new ReportDataHeader('channel', undefined, undefined, BigQueryFieldType.STRING),
      new ReportDataHeader('revenue', undefined, undefined, BigQueryFieldType.INTEGER),
    ];

    it('appends a Row Count header when aggregationConfig is non-empty', () => {
      const out = resolveReportDataHeaders(
        nativeWithMetric,
        {
          columnFilter: ['channel', 'revenue'],
          aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
        },
        BQ
      );
      const last = out[out.length - 1];
      expect(last.name).toBe(ROW_COUNT_LABEL);
      expect(last.storageFieldType).toBe(BigQueryFieldType.INTEGER);
      expect(last.aggregateFunction).toBe('COUNT');
    });

    it('does not append Row Count when aggregationConfig is empty or absent', () => {
      const noAgg = resolveReportDataHeaders(native, { columnFilter: ['channel'] }, BQ);
      expect(noAgg.some(h => h.name === ROW_COUNT_LABEL)).toBe(false);

      const emptyAgg = resolveReportDataHeaders(
        native,
        { columnFilter: ['channel'], aggregationConfig: [] },
        BQ
      );
      expect(emptyAgg.some(h => h.name === ROW_COUNT_LABEL)).toBe(false);
    });

    it('rowCount: false opts out of the Row Count header even when aggregationConfig is non-empty (Totals)', () => {
      // Row Count is a per-group column, NOT a grand total. The Totals query opts out so the
      // totals block carries only the metric aggregates.
      const out = resolveReportDataHeaders(
        nativeWithMetric,
        {
          columnFilter: ['revenue'],
          aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
          rowCount: false,
        },
        BQ
      );
      expect(out.some(h => h.name === ROW_COUNT_LABEL)).toBe(false);
      expect(out.map(h => h.name)).toEqual([aggregatedColumnLabel('revenue', 'SUM')]);
    });

    it('rowCount: true keeps the Row Count header (explicit, matches the default)', () => {
      const out = resolveReportDataHeaders(
        nativeWithMetric,
        {
          columnFilter: ['channel', 'revenue'],
          aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
          rowCount: true,
        },
        BQ
      );
      expect(out[out.length - 1].name).toBe(ROW_COUNT_LABEL);
    });

    it('Row Count is appended last after all aggregated column headers', () => {
      const out = resolveReportDataHeaders(
        nativeWithMetric,
        {
          columnFilter: ['channel', 'revenue'],
          aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
        },
        BQ
      );
      expect(out.map(h => h.name)).toEqual([
        'channel',
        aggregatedColumnLabel('revenue', 'SUM'),
        ROW_COUNT_LABEL,
      ]);
    });
  });

  describe('Unique Count header', () => {
    const native = [
      new ReportDataHeader('channel', undefined, undefined, BigQueryFieldType.STRING),
    ];

    it('uniqueCount: true → last header has name "Unique Count", aggregateFunction COUNT_DISTINCT, integer type', () => {
      const out = resolveReportDataHeaders(native, { uniqueCount: true }, BQ);
      const last = out[out.length - 1];
      expect(last.name).toBe(UNIQUE_COUNT_LABEL);
      expect(last.aggregateFunction).toBe('COUNT_DISTINCT');
      // integerTypeFor(BQ) → BigQueryFieldType.INTEGER
      expect(last.storageFieldType).toBe(BigQueryFieldType.INTEGER);
    });

    it('uniqueCount: false → no "Unique Count" header', () => {
      const out = resolveReportDataHeaders(native, { uniqueCount: false }, BQ);
      expect(out.some(h => h.name === UNIQUE_COUNT_LABEL)).toBe(false);
    });

    it('uniqueCount absent → no "Unique Count" header', () => {
      const out = resolveReportDataHeaders(native, {}, BQ);
      expect(out.some(h => h.name === UNIQUE_COUNT_LABEL)).toBe(false);
    });

    it('uniqueCount-only with no/empty columnFilter → ONLY the Unique Count header (no native dimensions)', () => {
      // A metrics-only SELECT emits just COUNT(DISTINCT pk); the headers must match it.
      // Previously an empty/absent filter fell back to ALL native headers, desyncing from
      // the 1-column SELECT (null-filled rows on BigQuery, "column not found" on Athena).
      const undefinedFilter = resolveReportDataHeaders(native, { uniqueCount: true }, BQ);
      expect(undefinedFilter.map(h => h.name)).toEqual([UNIQUE_COUNT_LABEL]);

      const emptyFilter = resolveReportDataHeaders(
        native,
        { uniqueCount: true, columnFilter: [] },
        BQ
      );
      expect(emptyFilter.map(h => h.name)).toEqual([UNIQUE_COUNT_LABEL]);
    });
  });
});
