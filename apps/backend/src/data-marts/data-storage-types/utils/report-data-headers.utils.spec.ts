import { resolveReportDataHeaders } from './report-data-headers.utils';
import { ReportDataHeader } from '../../dto/domain/report-data-header.dto';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { BigQueryFieldType } from '../bigquery/enums/bigquery-field-type.enum';
import {
  UNIQUE_COUNT_LABEL,
  aggregatedColumnAlias,
  aggregatedColumnLabel,
} from '../../dto/schemas/aggregation-labels';
import { buildJoinedUniqueCountColumnName } from '../../services/blended-field-name';
import type { JoinedUniqueCountHeaderSource } from '../interfaces/blended-query-builder.interface';
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
      // a result row keyed by those aliases must find its header by name.
      const row: Record<string, unknown> = {
        channel: 'paid',
        [aggregatedColumnLabel('revenue', 'SUM')]: 42,
      };
      for (const header of out) {
        expect(header.name in row).toBe(true);
      }
    });

    it('expands one column with two functions into two headers, in rule order, with effective types', () => {
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
      expect(out.map(h => h.name)).toEqual([
        'channel',
        aggregatedColumnLabel('revenue', 'SUM'),
        aggregatedColumnLabel('revenue', 'AVG'),
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
      const aggregatedNames = headers.filter(h => h.aggregateFunction).map(h => `\`${h.name}\``);
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
        },
        BQ
      );
      const aggregated = out.find(h => h.aggregateFunction === 'SUM');
      expect(aggregated?.storageFieldType).toBe(BigQueryFieldType.FLOAT);
    });

    it('appends the function token after a Google Sheets joined-field label, not inside it', () => {
      // A Google Sheets report labels joined fields `Field name (Data Mart name)`. Aggregating one
      // must read `Cost (Partners) | SUM` — the data mart name stays glued to the field it
      // qualifies, and the function token lands last, as it does for every other column.
      const blendedHeader = new ReportDataHeader(
        'partner__cost',
        'Cost (Partners)',
        undefined,
        BigQueryFieldType.FLOAT
      );
      const out = resolveReportDataHeaders(
        [],
        {
          columnFilter: ['partner__cost'],
          aggregationConfig: [{ column: 'partner__cost', function: 'SUM' }],
          blendedDataHeaders: [blendedHeader],
        },
        BQ
      );
      expect(out.find(h => h.aggregateFunction === 'SUM')?.alias).toBe('Cost (Partners) | SUM');
    });

    it('an aliased aggregated column suffixes the DISPLAY alias too (sheet header keeps `| <FUNC>`)', () => {
      // Regression: the sheet writer renders `alias || name`. If only the name gets the
      // suffix, an aliased metric shows a bare `<alias>` and drops `| <FUNC>`; with two
      // functions both columns would collide on the same header.
      const aliased = [
        new ReportDataHeader('channel', undefined, undefined, BigQueryFieldType.STRING),
        new ReportDataHeader('revenue', 'Revenue', undefined, BigQueryFieldType.INTEGER),
      ];
      const out = resolveReportDataHeaders(
        aliased,
        {
          columnFilter: ['channel', 'revenue'],
          aggregationConfig: [
            { column: 'revenue', function: 'SUM' },
            { column: 'revenue', function: 'AVG' },
          ],
        },
        BQ
      );
      const sum = out.find(h => h.name === aggregatedColumnLabel('revenue', 'SUM'));
      const avg = out.find(h => h.name === aggregatedColumnLabel('revenue', 'AVG'));
      expect(sum?.alias).toBe(aggregatedColumnAlias('Revenue', 'SUM'));
      expect(avg?.alias).toBe(aggregatedColumnAlias('Revenue', 'AVG'));
      // Distinct display labels — no header collision.
      expect(sum?.alias).not.toBe(avg?.alias);
      // A non-aggregated dimension keeps its plain (here: absent) alias.
      expect(out.find(h => h.name === 'channel')?.alias).toBeUndefined();
    });

    it('an aggregated column with NO alias leaves the alias undefined (writer falls back to name)', () => {
      const out = resolveReportDataHeaders(
        native,
        {
          columnFilter: ['channel', 'revenue'],
          aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
        },
        BQ
      );
      const revenue = out.find(h => h.name === aggregatedColumnLabel('revenue', 'SUM'));
      expect(revenue?.alias).toBeUndefined();
    });

    it('an unknown aggregated column (no native/blended header) yields undefined type, not a forced lie', () => {
      // Defence-in-depth for the removed non-null assertion: with no base type the effective
      // type is genuinely unknown and must surface as undefined rather than being forced.
      const out = resolveReportDataHeaders(
        [],
        {
          columnFilter: ['mystery'],
          aggregationConfig: [{ column: 'mystery', function: 'SUM' }],
        },
        BQ
      );
      const aggregated = out.find(h => h.aggregateFunction === 'SUM');
      expect(aggregated).toBeDefined();
      expect(aggregated?.storageFieldType).toBeUndefined();
    });
  });

  describe('Unique Count header', () => {
    const native = [
      new ReportDataHeader('channel', undefined, undefined, BigQueryFieldType.STRING),
    ];

    it('uniqueCount: true → last header has name "Unique Count", aggregateFunction COUNT_DISTINCT, integer type', () => {
      const out = resolveReportDataHeaders(
        native,
        { uniqueCount: true, primaryKeyColumns: ['id'] },
        BQ
      );
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
      const undefinedFilter = resolveReportDataHeaders(
        native,
        { uniqueCount: true, primaryKeyColumns: ['id'] },
        BQ
      );
      expect(undefinedFilter.map(h => h.name)).toEqual([UNIQUE_COUNT_LABEL]);

      const emptyFilter = resolveReportDataHeaders(
        native,
        { uniqueCount: true, primaryKeyColumns: ['id'], columnFilter: [] },
        BQ
      );
      expect(emptyFilter.map(h => h.name)).toEqual([UNIQUE_COUNT_LABEL]);
    });

    it('omits the Unique Count header when the primary key is gone (F4)', () => {
      // The SQL emits COUNT(DISTINCT pk) only when the key is non-empty. A key dropped after the
      // report was saved must take the header with it — otherwise the destination gets a column
      // the result set never contains (null on most storages, "column not found" on Athena).
      const headers = resolveReportDataHeaders(
        [],
        { uniqueCount: true, primaryKeyColumns: [] },
        DataStorageType.GOOGLE_BIGQUERY
      );
      expect(headers.map(h => h.name)).not.toContain(UNIQUE_COUNT_LABEL);
    });

    it('omits the Unique Count header when primaryKeyColumns is absent (same predicate as the SQL)', () => {
      const headers = resolveReportDataHeaders([], { uniqueCount: true }, BQ);
      expect(headers.map(h => h.name)).not.toContain(UNIQUE_COUNT_LABEL);
    });

    // F16: the header was gated on the key, but "is this query metrics-only?" read the UNGATED
    // flag. A report saved with Unique Count and no projection, whose primary key was later
    // removed, therefore emitted ZERO headers — while the SQL, which uses the gated predicate,
    // fell back to a plain SELECT of every column. Every value the run returned was dropped.
    it('falls back to the native dimensions when the key is gone, matching the SQL (F16)', () => {
      expect(
        resolveReportDataHeaders(native, { uniqueCount: true, primaryKeyColumns: [] }, BQ).map(
          h => h.name
        )
      ).toEqual(['channel']);

      expect(resolveReportDataHeaders(native, { uniqueCount: true }, BQ).map(h => h.name)).toEqual([
        'channel',
      ]);
    });

    it('still emits no dimension headers when the key survives (metrics-only is unchanged)', () => {
      const headers = resolveReportDataHeaders(
        native,
        { uniqueCount: true, primaryKeyColumns: ['id'] },
        BQ
      );
      expect(headers.map(h => h.name)).toEqual([UNIQUE_COUNT_LABEL]);
    });
  });

  describe('joined Unique Count headers', () => {
    const source = (aliasPath: string, prefix: string) => ({
      aliasPath,
      cteName: aliasPath.split('.').join('_'),
      pkColumns: ['id'],
      outputLabel: buildJoinedUniqueCountColumnName(aliasPath),
      displayLabel: `${prefix} Unique Count`,
    });

    // The header side takes `JoinedUniqueCountHeaderSource`, which is the two labels and nothing
    // else — passing a value that carries no `cteName`/`pkColumns` at all is what proves the
    // resolver never reaches for them (#6792).
    it('needs only the two labels, not how the SQL was built', () => {
      const labelsOnly: JoinedUniqueCountHeaderSource = {
        outputLabel: 'orders__unique_count',
        displayLabel: 'Orders Unique Count',
      };

      const headers = resolveReportDataHeaders([], { uniqueCountSources: [labelsOnly] }, BQ);

      expect(headers.map(h => [h.name, h.alias])).toEqual([
        ['orders__unique_count', 'Orders Unique Count'],
      ]);
    });

    it('emits one header per joined Unique Count source', () => {
      const headers = resolveReportDataHeaders(
        [],
        {
          uniqueCountSources: [
            {
              aliasPath: 'orders',
              cteName: 'orders',
              pkColumns: ['id'],
              outputLabel: 'orders__unique_count',
              displayLabel: 'Orders Unique Count',
            },
          ],
        },
        DataStorageType.GOOGLE_BIGQUERY
      );
      expect(headers.map(h => h.name)).toContain('orders__unique_count');
      expect(headers.map(h => h.alias)).toContain('Orders Unique Count');
    });

    // The header `name` is what a name-keyed reader binds a result row by AND what the SQL aliased,
    // so it must be a legal identifier. The free-form source title lives in `alias`, which is what
    // the sheet writer (`header.alias || header.name`) and MCP (`alias ?? name`) actually render.
    it('names the column SQL-safely and keeps the free-form prefix as the display alias', () => {
      const headers = resolveReportDataHeaders(
        [],
        { uniqueCountSources: [source('orders.items', 'Items')] },
        BQ
      );
      expect(headers[0].name).toBe('orders_items__unique_count');
      expect(headers[0].alias).toBe('Items Unique Count');
    });

    it('a free-form source title never reaches the SQL identifier (dots, backticks)', () => {
      // `GA4.Events` as a header NAME would be rejected by BigQuery even fully quoted, and a
      // backtick would break out of the quoting entirely. Both stay on the display side.
      const headers = resolveReportDataHeaders(
        [],
        {
          uniqueCountSources: [
            {
              aliasPath: 'ga4_events',
              cteName: 'ga4_events',
              pkColumns: ['id'],
              outputLabel: buildJoinedUniqueCountColumnName('ga4_events'),
              displayLabel: 'GA4.Ev`ents Unique Count',
            },
          ],
        },
        BQ
      );
      expect(headers[0].name).toBe('ga4_events__unique_count');
      expect(headers[0].name).not.toMatch(/[.`]/);
      expect(headers[0].alias).toBe('GA4.Ev`ents Unique Count');
    });

    // The SQL names always differ (they come from the alias path), so a name-keyed reader is never
    // confused. The display aliases DO coincide when two sources share a display prefix, and that
    // is deliberate: a uniqueness-driven label would make a column's header depend on which other
    // columns happen to be selected — see `formatBlendedFieldDisplayName`, which every ordinary
    // joined field of those same two sources already follows.
    it('two sources sharing a display prefix still get distinct NAMES', () => {
      const headers = resolveReportDataHeaders(
        [],
        {
          uniqueCountSources: [source('orders', 'Orders'), source('legacy_orders', 'Orders')],
        },
        BQ
      );
      expect(headers.map(h => h.name)).toEqual([
        'orders__unique_count',
        'legacy_orders__unique_count',
      ]);
      expect(headers.map(h => h.alias)).toEqual(['Orders Unique Count', 'Orders Unique Count']);
    });

    it('types a joined Unique Count header as an integer COUNT_DISTINCT metric', () => {
      const headers = resolveReportDataHeaders(
        [],
        { uniqueCountSources: [source('orders', 'Orders')] },
        BQ
      );
      const header = headers.find(h => h.name === buildJoinedUniqueCountColumnName('orders'));
      expect(header?.aggregateFunction).toBe('COUNT_DISTINCT');
      expect(header?.storageFieldType).toBe(BigQueryFieldType.INTEGER);
    });

    it('emits a header per source, in list order, after the main Unique Count', () => {
      const headers = resolveReportDataHeaders(
        [],
        {
          columnFilter: ['customer_email'],
          uniqueCount: true,
          primaryKeyColumns: ['user_id'],
          uniqueCountSources: [source('orders', 'Orders'), source('orders.items', 'Items')],
        },
        BQ
      );
      expect(headers.map(h => h.name)).toEqual([
        'customer_email',
        UNIQUE_COUNT_LABEL,
        'orders__unique_count',
        'orders_items__unique_count',
      ]);
    });

    it('a joined Unique Count alone makes the query metrics-only (no native dimension headers)', () => {
      // Same rule as the main Unique Count: with no projection the SELECT carries only the
      // synthetic metric, so falling back to every native header would desync the two.
      const native = [
        new ReportDataHeader('channel', undefined, undefined, BigQueryFieldType.STRING),
      ];
      const headers = resolveReportDataHeaders(
        native,
        { uniqueCountSources: [source('orders', 'Orders')] },
        BQ
      );
      expect(headers.map(h => h.name)).toEqual(['orders__unique_count']);
    });

    it('no sources → no joined Unique Count headers (legacy shape untouched)', () => {
      const headers = resolveReportDataHeaders(
        [new ReportDataHeader('channel', undefined, undefined, BigQueryFieldType.STRING)],
        { columnFilter: ['channel'], uniqueCountSources: [] },
        BQ
      );
      expect(headers.map(h => h.name)).toEqual(['channel']);
    });
  });
});
