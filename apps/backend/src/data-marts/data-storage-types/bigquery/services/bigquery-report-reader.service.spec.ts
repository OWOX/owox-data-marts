import { BigQuery } from '@google-cloud/bigquery';
import { BigQueryReportReader } from './bigquery-report-reader.service';
import { BigQueryReportHeadersGenerator } from './bigquery-report-headers-generator.service';
import { BigQueryFieldType } from '../enums/bigquery-field-type.enum';
import { DataMartDefinitionType } from '../../../enums/data-mart-definition-type.enum';

describe('BigQueryReportReader value transport', () => {
  const reader = new BigQueryReportReader({} as never, {} as never, {} as never, {} as never);

  const [row] = BigQuery.mergeSchemaWithRows_(
    {
      fields: [
        {
          name: 'truthy_value',
          type: 'RECORD',
          fields: [
            { name: 'value', type: 'INT64' },
            { name: 'currency', type: 'STRING' },
          ],
        },
        {
          name: 'zero_value',
          type: 'RECORD',
          fields: [
            { name: 'value', type: 'INT64' },
            { name: 'currency', type: 'STRING' },
          ],
        },
        {
          name: 'wrapped',
          type: 'RECORD',
          fields: [
            { name: 'date', type: 'DATE' },
            { name: 'timestamp', type: 'TIMESTAMP' },
            { name: 'amount', type: 'NUMERIC' },
            { name: 'bytes', type: 'BYTES' },
            { name: 'validity', type: 'RANGE', rangeElementType: { type: 'DATE' } },
          ],
        },
        {
          name: 'items',
          type: 'RECORD',
          mode: 'REPEATED',
          fields: [
            { name: 'value', type: 'INT64' },
            { name: 'currency', type: 'STRING' },
          ],
        },
      ],
    },
    [
      {
        f: [
          { v: { f: [{ v: '5' }, { v: 'USD' }] } },
          { v: { f: [{ v: '0' }, { v: 'ZERO' }] } },
          {
            v: {
              f: [
                { v: '2026-09-16' },
                { v: '2026-09-16T12:34:56.000Z' },
                { v: '123.45' },
                { v: 'YWJj' },
                { v: '[2026-01-01, 2026-01-03)' },
              ],
            },
          },
          {
            v: [
              { v: { f: [{ v: '5' }, { v: 'USD' }] } },
              { v: { f: [{ v: '0' }, { v: 'ZERO' }] } },
            ],
          },
        ],
      },
    ] as never,
    {
      wrapIntegers: false,
      listParams: { 'formatOptions.timestampOutputFormat': 'ISO8601_STRING' },
    }
  );

  const readJson = (column: string): unknown => {
    const [value] = reader.getStructuredReportRowData(row, [column]);
    expect(typeof value).toBe('string');
    return JSON.parse(value as string);
  };

  it.each([
    ['truthy_value', { value: 5, currency: 'USD' }],
    ['zero_value', { value: 0, currency: 'ZERO' }],
  ])(
    'serializes a record named %s without mistaking its value field for an SDK wrapper',
    (name, expected) => {
      expect(readJson(name)).toEqual(expected);
    }
  );

  it('recursively normalizes SDK wrappers inside a selected record', () => {
    expect(readJson('wrapped')).toEqual({
      date: '2026-09-16',
      timestamp: '2026-09-16T12:34:56.000Z',
      amount: '123.45',
      bytes: 'YWJj',
      validity: {
        elementType: 'DATE',
        start: '2026-01-01',
        end: '2026-01-03',
      },
    });
  });

  it('normalizes records inside a repeated field without losing row boundaries', () => {
    expect(readJson('items')).toEqual([
      { value: 5, currency: 'USD' },
      { value: 0, currency: 'ZERO' },
    ]);
  });

  it('keeps a selected scalar descendant scalar', () => {
    expect(reader.getStructuredReportRowData(row, ['wrapped.date'])).toEqual(['2026-09-16']);
  });
});

describe('BigQueryReportReader queryTimeoutMs threading (Phase 3)', () => {
  const buildReport = () =>
    ({
      dataMart: {
        storage: { id: 's1', config: { projectId: 'my-project' } },
        definitionType: DataMartDefinitionType.SQL,
        definition: { sqlQuery: 'SELECT 1' },
        schema: { type: 'bigquery-data-mart-schema', fields: [] },
      },
    }) as never;

  const createReader = () => {
    const adapter = {
      executeQuery: jest.fn().mockResolvedValue({ jobId: 'job-1' }),
      getJob: jest.fn().mockResolvedValue({
        metadata: {
          configuration: {
            query: { destinationTable: { projectId: 'p', datasetId: 'd', tableId: 't' } },
          },
        },
      }),
      createTableReference: jest.fn().mockReturnValue({
        getRows: jest.fn().mockResolvedValue([[], undefined]),
      }),
    };
    const adapterFactory = { createFromStorage: jest.fn().mockResolvedValue(adapter) };
    const queryBuilder = { buildQuery: jest.fn() };
    const headersGenerator = { generateHeaders: jest.fn().mockReturnValue([]) };
    const credentialsResolver = {};
    const reader = new BigQueryReportReader(
      adapterFactory as never,
      queryBuilder as never,
      headersGenerator as never,
      credentialsResolver as never
    );
    return { reader, adapter };
  };

  it('threads queryTimeoutMs and signal into adapter.executeQuery', async () => {
    const { reader, adapter } = createReader();
    const signal = new AbortController().signal;

    await reader.prepareReportData(buildReport(), {
      sqlOverride: 'SELECT 1',
      queryTimeoutMs: 30000,
      signal,
    });
    // executeQuery is lazy — the first batch read materializes the destination table.
    await reader.readReportDataBatch();

    expect(adapter.executeQuery).toHaveBeenCalledWith('SELECT 1', undefined, 30000, signal);
  });

  it('passes an undefined timeout and signal when the options are absent (regression)', async () => {
    const { reader, adapter } = createReader();

    await reader.prepareReportData(buildReport(), { sqlOverride: 'SELECT 1' });
    await reader.readReportDataBatch();

    expect(adapter.executeQuery).toHaveBeenCalledWith('SELECT 1', undefined, undefined, undefined);
  });
});

// Real-execution-path pin (not just resolveReportDataHeaders in isolation): a report selecting a
// native dimension AND a calculated field must come back with BOTH headers, in selection order,
// with no duplicate — the "silently blank column in Sheets / Looker Studio" failure class the
// header work exists to prevent. Uses the REAL BigQueryReportHeadersGenerator (which already
// excludes calculated fields from the native list — see its own isCalculatedField check) so this
// proves the two mechanisms compose correctly, not just that each is individually correct.
describe('BigQueryReportReader — calculated field header on the real read path', () => {
  const buildReaderWithRealHeadersGenerator = () => {
    const adapter = {
      executeQuery: jest.fn().mockResolvedValue({ jobId: 'job-1' }),
      getJob: jest.fn().mockResolvedValue({
        metadata: {
          configuration: {
            query: { destinationTable: { projectId: 'p', datasetId: 'd', tableId: 't' } },
          },
        },
      }),
      createTableReference: jest.fn().mockReturnValue({
        getRows: jest.fn().mockResolvedValue([[], undefined]),
      }),
    };
    const adapterFactory = { createFromStorage: jest.fn().mockResolvedValue(adapter) };
    const queryBuilder = { buildQuery: jest.fn() };
    const headersGenerator = new BigQueryReportHeadersGenerator();
    const credentialsResolver = {};
    return new BigQueryReportReader(
      adapterFactory as never,
      queryBuilder as never,
      headersGenerator as never,
      credentialsResolver as never
    );
  };

  const reportWithCtr = () =>
    ({
      dataMart: {
        storage: { id: 's1', config: { projectId: 'my-project' } },
        definitionType: DataMartDefinitionType.SQL,
        definition: { sqlQuery: 'SELECT 1' },
        schema: {
          type: 'bigquery-data-mart-schema',
          fields: [
            { name: 'country', type: 'STRING', mode: 'NULLABLE', status: 'CONNECTED' },
            { name: 'clicks', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
            { name: 'impressions', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
            {
              name: 'ctr',
              type: 'FLOAT',
              mode: 'NULLABLE',
              status: 'CONNECTED',
              calculated: {
                formula:
                  'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
                level: 'metric',
              },
            },
          ],
        },
      },
    }) as never;

  it("yields ['country', 'ctr'] headers — native then synthesized, typed from the declared type, no duplicate", async () => {
    const reader = buildReaderWithRealHeadersGenerator();

    // Mirrors what every real caller of prepareReportData now does (RunReportService,
    // ReportDataCacheService, StreamHttpDataService, QueryDataMartService): the composed SQL is
    // passed as sqlOverride, the metric's own name is EXCLUDED from columnFilter (it renders
    // through calculatedFields, not the plain projection), and calculatedFields is forwarded
    // for header synthesis.
    const description = await reader.prepareReportData(reportWithCtr(), {
      sqlOverride:
        'SELECT `country`, SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr` ' +
        'FROM `p`.`d`.`t` GROUP BY `country`',
      columnFilter: ['country'],
      calculatedFields: [
        {
          outputName: 'ctr',
          type: 'FLOAT',
          formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
          level: 'metric',
        },
      ],
    });

    expect(description.dataHeaders.map(h => [h.name, h.storageFieldType])).toEqual([
      ['country', BigQueryFieldType.STRING],
      ['ctr', BigQueryFieldType.FLOAT],
    ]);
    expect(description.dataHeaders.filter(h => h.name === 'ctr')).toHaveLength(1);
  });

  // This used to pin the opposite: a caller that left 'ctr' in `columnFilter` got TWO headers for
  // it, and `excludeCalculatedFieldNames` at five call sites was all that stood between that and
  // production. `resolveReportDataHeaders` now resolves the name itself, so the shape below is
  // simply correct — and it keeps the analyst's position, which the exclusion threw away.
  it('resolves a calculated name the caller left in columnFilter, once and in place', async () => {
    const reader = buildReaderWithRealHeadersGenerator();

    const description = await reader.prepareReportData(reportWithCtr(), {
      sqlOverride: 'SELECT 1',
      columnFilter: ['ctr', 'country'],
      calculatedFields: [{ outputName: 'ctr', type: 'FLOAT', formula: '…', level: 'metric' }],
    });

    expect(description.dataHeaders.filter(h => h.name === 'ctr')).toHaveLength(1);
    expect(description.dataHeaders.map(h => h.name)).toEqual(['ctr', 'country']);
    // Its declared type, not the `(col, col)` placeholder the name used to fall through to.
    expect(description.dataHeaders[0].storageFieldType).toBe(BigQueryFieldType.FLOAT);
  });
});
