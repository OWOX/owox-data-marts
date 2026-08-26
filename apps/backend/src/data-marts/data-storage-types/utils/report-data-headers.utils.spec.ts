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
import type { CalculatedFieldPlan } from './sql-clause-renderer';

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

  describe('calculated field headers', () => {
    const nat = (name: string, type: BigQueryFieldType) =>
      new ReportDataHeader(name, undefined, undefined, type);

    // The analyst chose where the column goes. Appending it made a report configured
    // ['ctr','clicks'] write `ctr` last, and the position was already lost before this function:
    // five producers strip the name from `columnFilter` on their own. Resolving it HERE keeps the
    // order, and removes an invariant that nothing but a convention was holding.
    it('places a calculated field where the column filter names it', () => {
      const headers = resolveReportDataHeaders(
        [nat('clicks', BigQueryFieldType.INTEGER), nat('impressions', BigQueryFieldType.INTEGER)],
        {
          columnFilter: ['ctr', 'clicks', 'impressions'],
          calculatedFields: [{ outputName: 'ctr', type: 'FLOAT', formula: '…', level: 'metric' }],
        },
        BQ
      );

      expect(headers.map(h => h.name)).toEqual(['ctr', 'clicks', 'impressions']);
      expect(headers[0].storageFieldType).toBe('FLOAT');
      expect(headers[0].calculatedFieldLevel).toBe('metric');
    });

    // A name in the filter with no warehouse column behind it used to fall through to the
    // `(col, col)` placeholder — an untyped header for a column the SELECT does emit, under a name
    // that is right, which is why a producer forgetting to strip it went unnoticed.
    it('does not leave a calculated name to the placeholder branch', () => {
      const headers = resolveReportDataHeaders(
        [nat('clicks', BigQueryFieldType.INTEGER)],
        {
          columnFilter: ['ctr'],
          calculatedFields: [{ outputName: 'ctr', type: 'FLOAT', formula: '…', level: 'metric' }],
        },
        BQ
      );

      expect(headers).toHaveLength(1);
      expect(headers[0].storageFieldType).toBe('FLOAT');
    });

    // The stripped convention still has to work: every existing producer removes the name itself.
    it('still appends a metric the filter does not name', () => {
      const headers = resolveReportDataHeaders(
        [nat('clicks', BigQueryFieldType.INTEGER)],
        {
          columnFilter: ['clicks'],
          calculatedFields: [{ outputName: 'ctr', type: 'FLOAT', formula: '…', level: 'metric' }],
        },
        BQ
      );

      expect(headers.map(h => h.name)).toEqual(['clicks', 'ctr']);
    });

    it('names it once when the filter carries it and never twice', () => {
      const headers = resolveReportDataHeaders(
        [nat('clicks', BigQueryFieldType.INTEGER)],
        {
          columnFilter: ['ctr', 'clicks'],
          calculatedFields: [{ outputName: 'ctr', type: 'FLOAT', formula: '…', level: 'metric' }],
        },
        BQ
      );

      expect(headers.filter(h => h.name === 'ctr')).toHaveLength(1);
    });

    // The LEVEL rule decides expansion, and it must keep deciding it from the filter position too:
    // an aggregate-level formula is not expanded even when a rule names it.
    it('withholds expansion from an aggregate-level metric the filter places', () => {
      const headers = resolveReportDataHeaders(
        [nat('clicks', BigQueryFieldType.INTEGER)],
        {
          columnFilter: ['ctr', 'clicks'],
          aggregationConfig: [
            { column: 'ctr', function: 'SUM' },
            { column: 'clicks', function: 'SUM' },
          ],
          calculatedFields: [{ outputName: 'ctr', type: 'FLOAT', formula: '…', level: 'metric' }],
        },
        BQ
      );

      expect(headers.map(h => h.name)).toEqual(['ctr', 'clicks | SUM']);
      expect(headers[0].aggregateFunction).toBeUndefined();
    });

    // A ROW-LEVEL formula the report aggregates DOES expand, and the expansion has to land in the
    // filter's position rather than at the end.
    it('expands a row-level metric in place when the report aggregates it', () => {
      const headers = resolveReportDataHeaders(
        [nat('clicks', BigQueryFieldType.INTEGER)],
        {
          columnFilter: ['session_key', 'clicks'],
          aggregationConfig: [{ column: 'session_key', function: 'COUNT_DISTINCT' }],
          calculatedFields: [
            {
              outputName: 'session_key',
              type: 'STRING',
              formula: '…',
              level: 'column',
              isAggregatedByReport: true,
            },
          ],
        },
        BQ
      );

      expect(headers.map(h => h.name)).toEqual(['session_key | COUNTUNIQUE', 'clicks']);
    });

    it('synthesizes a header for a selected calculated field with its declared type', () => {
      const headers = resolveReportDataHeaders(
        [],
        {
          calculatedFields: [{ outputName: 'ctr', type: 'FLOAT', formula: '…', level: 'metric' }],
        },
        BQ
      );
      expect(headers).toContainEqual(
        expect.objectContaining({ name: 'ctr', storageFieldType: 'FLOAT' })
      );
    });

    // No report aggregate function describes a formula, so the header cannot carry one — and a
    // BARE `undefined` there is how an ordinary native column looks. Consumers that read the
    // absence (Looker Studio's schema builder does) would then treat a ratio as a plain numeric
    // column they may roll up. The LEVEL is what keeps the two apart.
    it('carries the aggregating level onto the header, with no report aggregate function', () => {
      const headers = resolveReportDataHeaders(
        [],
        {
          calculatedFields: [{ outputName: 'ctr', type: 'FLOAT', formula: '…', level: 'metric' }],
        },
        BQ
      );
      expect(headers).toHaveLength(1);
      expect(headers[0].calculatedFieldLevel).toBe('metric');
      expect(headers[0].aggregateFunction).toBeUndefined();
    });

    // The header used to mark every calculated field as an aggregate, which the Looker mapper
    // reads as "METRIC whatever the declared type says" — so a row-level `CONCAT(session_id,
    // user_id)` reached the destination as a metric Looker refuses to group by. The
    // level must travel, not the fact of being calculated.
    it('carries the ROW-LEVEL level onto the header, unchanged from the plan', () => {
      const headers = resolveReportDataHeaders(
        [],
        {
          calculatedFields: [
            { outputName: 'session_key', type: 'STRING', formula: '…', level: 'column' },
          ],
        },
        BQ
      );
      expect(headers).toHaveLength(1);
      expect(headers[0].calculatedFieldLevel).toBe('column');
      expect(headers[0].aggregateFunction).toBeUndefined();
    });

    // `calculatedFieldLevel` is the ONE key that travels. A second, boolean spelling was written
    // beside it for a release, on the premise that a pod running older code reads that name — but
    // no released build has ever read or written either: both were introduced together, on this
    // branch. Writing a key nobody reads bought nothing and had to be maintained, so it is gone.
    // The real exposure it claimed to cover is unchanged and unclosable by any key: during a
    // rolling window an old pod serving Looker from a new pod's cache row finds no marker at all.
    it('writes the level and nothing beside it', () => {
      const headers = resolveReportDataHeaders(
        [],
        {
          calculatedFields: [{ outputName: 'ctr', type: 'FLOAT', formula: '…', level: 'metric' }],
        },
        BQ
      );
      expect(headers[0].calculatedFieldLevel).toBe('metric');
      expect(headers[0]).not.toHaveProperty('isCalculatedField');
    });

    it('appends the calculated field header last, after Unique Count', () => {
      const headers = resolveReportDataHeaders(
        [],
        {
          columnFilter: ['country'],
          uniqueCount: true,
          primaryKeyColumns: ['id'],
          calculatedFields: [{ outputName: 'ctr', type: 'FLOAT', formula: '…', level: 'metric' }],
        },
        BQ
      );
      expect(headers.map(h => h.name)).toEqual(['country', UNIQUE_COUNT_LABEL, 'ctr']);
    });

    // This list is the metric's ONLY header source (no native column, no aggregation rule), so
    // dropping the analyst's own label here left a metric aliased "CTR, %" as the single column in
    // its own report still labelled `ctr` — in the Google Sheet, in Looker Studio's field label
    // (`alias || name`), in MCP's `displayName`, and as an HTTP Data `title: undefined`.
    it("carries the analyst's alias and description onto the calculated field header", () => {
      const headers = resolveReportDataHeaders(
        [],
        {
          calculatedFields: [
            {
              outputName: 'ctr',
              type: 'FLOAT',
              formula: '…',
              level: 'metric',
              alias: 'CTR, %',
              description: 'Clicks per impression.',
            },
          ],
        },
        BQ
      );
      expect(headers[0].alias).toBe('CTR, %');
      expect(headers[0].description).toBe('Clicks per impression.');
    });

    it('leaves alias/description undefined for a metric that declares neither', () => {
      const headers = resolveReportDataHeaders(
        [],
        {
          calculatedFields: [{ outputName: 'ctr', type: 'FLOAT', formula: '…', level: 'metric' }],
        },
        BQ
      );
      expect(headers[0].alias).toBeUndefined();
      expect(headers[0].description).toBeUndefined();
    });

    it('emits one header per calculated field, in list order', () => {
      const headers = resolveReportDataHeaders(
        [],
        {
          calculatedFields: [
            { outputName: 'ctr', type: 'FLOAT', formula: '…', level: 'metric' },
            { outputName: 'roas', type: 'FLOAT', formula: '…', level: 'metric' },
          ],
        },
        BQ
      );
      expect(headers.map(h => h.name)).toEqual(['ctr', 'roas']);
    });

    it('no calculatedFields option → no calculated-metric headers (legacy shape untouched)', () => {
      const native = [
        new ReportDataHeader('channel', undefined, undefined, BigQueryFieldType.STRING),
      ];
      const headers = resolveReportDataHeaders(native, { columnFilter: ['channel'] }, BQ);
      expect(headers.map(h => h.name)).toEqual(['channel']);
    });

    // A report selecting ONLY a calculated field has its metric's name already excluded from
    // `columnFilter` by the caller (the metric renders through its own channel, not the plain
    // projection) — so `columnFilter` alone cannot signal "this is a metrics-only query" the way
    // it does for a dimension. Without `calculatedFields` in `metricsOnly`, an empty/absent
    // filter here falls back to EVERY native header (the "SELECT *" default) even though the SQL
    // projects exactly the metric — a silent null on BigQuery/Snowflake/Databricks, a hard
    // `Column ... not found in query results` on Athena/Redshift. Same failure class already
    // fixed for Unique Count above ('uniqueCount-only with no/empty columnFilter').
    it('calculatedFields-only with no/empty columnFilter → ONLY the metric header (no phantom native headers)', () => {
      const native = [
        new ReportDataHeader('channel', undefined, undefined, BigQueryFieldType.STRING),
        new ReportDataHeader('revenue', undefined, undefined, BigQueryFieldType.INTEGER),
      ];
      const calculatedFields: CalculatedFieldPlan[] = [
        { outputName: 'ctr', type: 'FLOAT', formula: '…', level: 'metric' },
      ];

      const undefinedFilter = resolveReportDataHeaders(native, { calculatedFields }, BQ);
      expect(undefinedFilter.map(h => h.name)).toEqual(['ctr']);

      const emptyFilter = resolveReportDataHeaders(
        native,
        { columnFilter: [], calculatedFields },
        BQ
      );
      expect(emptyFilter.map(h => h.name)).toEqual(['ctr']);
    });

    // The "projects only the synthetic columns" test above, for a ROW-LEVEL field — and the answer
    // is the same, because the SQL is the same shape. `composePlainSelectBody` DROPS the wildcard
    // once a calculated item is present, so `columns: []` plus a row-level field emits
    // `SELECT <expr> AS session_key FROM t` and nothing else (pinned by "projects a row-level
    // calculated field alone, without a wildcard" in each dialect's builder spec). Narrowing this
    // branch to aggregating fields — which the design asks for, written before that wildcard
    // decision — would answer with every native header for a SELECT that projects one column: a
    // null-filled row on BigQuery/Snowflake/Databricks, `Column ... not found` on Athena/Redshift.
    it('row-level-only with no/empty columnFilter → ONLY that field (the SELECT drops the wildcard)', () => {
      const native = [
        new ReportDataHeader('session_id', undefined, undefined, BigQueryFieldType.STRING),
        new ReportDataHeader('user_id', undefined, undefined, BigQueryFieldType.STRING),
      ];
      const calculatedFields: CalculatedFieldPlan[] = [
        { outputName: 'session_key', type: 'STRING', formula: '…', level: 'column' },
      ];

      const undefinedFilter = resolveReportDataHeaders(native, { calculatedFields }, BQ);
      expect(undefinedFilter.map(h => h.name)).toEqual(['session_key']);

      const emptyFilter = resolveReportDataHeaders(
        native,
        { columnFilter: [], calculatedFields },
        BQ
      );
      expect(emptyFilter.map(h => h.name)).toEqual(['session_key']);
    });

    // A report may apply an aggregation to a ROW-LEVEL calculated field, and
    // the SQL then emits one `<expr>` aggregate per rule under `aggregatedColumnLabel` instead of
    // the bare name. Readers bind rows to headers BY NAME, so a header still called `session_key`
    // matches no output column at all — a null column on BigQuery/Snowflake/Databricks and a hard
    // `Column ... not found in query results` on Athena/Redshift. The SAME expansion an ordinary
    // aggregated column already gets above, through the SAME label helper, because the alias the
    // renderer emits comes from that helper too.
    describe('once the REPORT aggregates a row-level calculated field', () => {
      const COUNT_UNIQUE = aggregatedColumnLabel('session_key', 'COUNT_DISTINCT');
      const COUNT = aggregatedColumnLabel('session_key', 'COUNT');
      const aggregated: CalculatedFieldPlan = {
        outputName: 'session_key',
        type: BigQueryFieldType.STRING,
        formula: '…',
        level: 'column',
        isAggregatedByReport: true,
      };

      it('names the header by the SQL alias — one per function, in rule order', () => {
        const headers = resolveReportDataHeaders(
          [],
          {
            calculatedFields: [aggregated],
            aggregationConfig: [
              { column: 'session_key', function: 'COUNT_DISTINCT' },
              { column: 'session_key', function: 'COUNT' },
            ],
            rowCount: false,
          },
          BQ
        );

        expect(headers.map(h => h.name)).toEqual([COUNT_UNIQUE, COUNT]);
        expect(headers.map(h => h.aggregateFunction)).toEqual(['COUNT_DISTINCT', 'COUNT']);
      });

      // The level still travels: the column has no warehouse column behind it, which consumers
      // that resolve one by name still need to see. What changes is that it now arrives WITH a
      // function, and Looker reads the pair as a metric rather than a grouping key.
      it('keeps the row-level level on every expanded header', () => {
        const headers = resolveReportDataHeaders(
          [],
          {
            calculatedFields: [aggregated],
            aggregationConfig: [{ column: 'session_key', function: 'COUNT_DISTINCT' }],
            rowCount: false,
          },
          BQ
        );

        expect(headers).toHaveLength(1);
        expect(headers[0].calculatedFieldLevel).toBe('column');
      });

      // The declared type describes the FORMULA's value, not the aggregate's: a COUNT_DISTINCT over
      // a STRING-declared formula is an integer count, and typing it STRING sends Looker a number
      // it files under Dimensions and a sheet writer a count formatted as text.
      it('widens the declared type per function, as an aggregated column does', () => {
        const headers = resolveReportDataHeaders(
          [],
          {
            calculatedFields: [aggregated],
            aggregationConfig: [
              { column: 'session_key', function: 'COUNT_DISTINCT' },
              { column: 'session_key', function: 'ANY_VALUE' },
            ],
            rowCount: false,
          },
          BQ
        );

        expect(headers[0].storageFieldType).toBe(BigQueryFieldType.INTEGER);
        // ANY_VALUE returns one of the values themselves, so it keeps the declared type.
        expect(headers[1].storageFieldType).toBe(BigQueryFieldType.STRING);
      });

      // Without the suffix the sheet writer's `alias || name` renders a bare `Session Key` twice,
      // dropping `| <FUNC>` and colliding when one field carries several functions — the same
      // reason the aggregated-column path suffixes its alias.
      it("suffixes the analyst's alias per function and keeps the description", () => {
        const headers = resolveReportDataHeaders(
          [],
          {
            calculatedFields: [
              { ...aggregated, alias: 'Session Key', description: 'Session identity.' },
            ],
            aggregationConfig: [
              { column: 'session_key', function: 'COUNT_DISTINCT' },
              { column: 'session_key', function: 'COUNT' },
            ],
            rowCount: false,
          },
          BQ
        );

        expect(headers.map(h => h.alias)).toEqual([
          aggregatedColumnAlias('Session Key', 'COUNT_DISTINCT'),
          aggregatedColumnAlias('Session Key', 'COUNT'),
        ]);
        expect(headers.every(h => h.description === 'Session identity.')).toBe(true);
      });

      // The verdict is read off the PLAN, never re-derived from the rules in hand. Here the two
      // disagree: an UNSTAMPED plan is still a grouping key, so the renderer projects it under its
      // bare name whatever a rule says — and a header expanded from the rule alone would name a
      // column the SELECT never emitted.
      it('reads the plan, not the rules: an unstamped plan stays one bare header', () => {
        const headers = resolveReportDataHeaders(
          [],
          {
            calculatedFields: [{ ...aggregated, isAggregatedByReport: undefined }],
            aggregationConfig: [{ column: 'session_key', function: 'COUNT_DISTINCT' }],
            rowCount: false,
          },
          BQ
        );

        expect(headers.map(h => h.name)).toEqual(['session_key']);
        expect(headers[0].aggregateFunction).toBeUndefined();
        expect(headers[0].storageFieldType).toBe(BigQueryFieldType.STRING);
      });

      // An AGGREGATE-level field already IS an aggregate: the renderer projects it under its own
      // name whatever the rules say, so a rule that illegally names one must not expand its header
      // either — the two lists would then disagree on the one thing readers bind by.
      it('never expands an aggregate-level metric, whatever the rules say', () => {
        const headers = resolveReportDataHeaders(
          [],
          {
            calculatedFields: [{ outputName: 'ctr', type: 'FLOAT', formula: '…', level: 'metric' }],
            aggregationConfig: [{ column: 'ctr', function: 'SUM' }],
            rowCount: false,
          },
          BQ
        );

        expect(headers.map(h => h.name)).toEqual(['ctr']);
        expect(headers[0].aggregateFunction).toBeUndefined();
        expect(headers[0].calculatedFieldLevel).toBe('metric');
      });
    });
  });
});
