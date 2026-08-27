import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import * as supertest from 'supertest';
import {
  AUTH_HEADER,
  closeTestApp,
  createTestApp,
  setupPublishedDataMart,
  setupReportPrerequisites,
  ReportBuilder,
} from '@owox/test-utils';
import { TypeResolver } from '../src/common/resolver/type-resolver';
import { DATA_STORAGE_REPORT_READER_RESOLVER } from '../src/data-marts/data-storage-types/data-storage-providers';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { DataMartSchemaProviderFacade } from '../src/data-marts/data-storage-types/facades/data-mart-schema-provider.facade';
import { DataStorageReportReader } from '../src/data-marts/data-storage-types/interfaces/data-storage-report-reader.interface';
import { ReportDataBatch } from '../src/data-marts/dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../src/data-marts/dto/domain/report-data-description.dto';
import { ReportDataHeader } from '../src/data-marts/dto/domain/report-data-header.dto';
import { BlendableSchemaService } from '../src/data-marts/services/blendable-schema.service';
import { DataMartTableReferenceService } from '../src/data-marts/services/data-mart-table-reference.service';
import { Report } from '../src/data-marts/entities/report.entity';
import { DataDestination } from '../src/data-marts/entities/data-destination.entity';

interface HttpRunView {
  type: string;
  runType: string;
  status: string;
  additionalParams: {
    httpData?: {
      format?: string;
      columns?: string[];
      filter?: Array<{ column: string; operator: string; value: string }>;
      sort?: Array<{ column: string; direction: string }>;
      aggregation?: Array<{ column: string; function: string }>;
      dateTrunc?: Array<{ column: string; unit: string; timeZone?: string }>;
      limit?: number;
      completed?: boolean;
      rowCount?: number;
      bytesWritten?: number;
      dataDescription?: { dataHeaders?: Array<{ name: string }> };
    };
  } | null;
}

const MOCK_HEADERS: ReportDataHeader[] = [
  new ReportDataHeader('date'),
  new ReportDataHeader('revenue'),
];

const MOCK_ROWS: unknown[][] = [
  ['2026-05-01', 42.5],
  ['2026-05-02', 51.0],
  ['2026-05-03', 100.25],
];

// Captures the options arg passed to prepareReportData on each call.
// Reset to null before each output-controls happy-path test.
let capturedPrepareOptions: Record<string, unknown> | null = null;

// Aggregated result the mock reader returns when a request carries an aggregation: [dimension,
// metric] positional row, matching the [date, "revenue | SUM"] header set.
const MOCK_AGGREGATED_ROWS: unknown[][] = [['2026-05-01', 999]];

// Deterministic value the mock reader emits for every projected calculated field, so a test can
// assert it is a NUMBER (streamed correctly) rather than `null` (the outputColumns-gate bug).
const MOCK_CALCULATED_FIELD_VALUE = 0.42;

function buildMockReader(headers: ReportDataHeader[], rows: unknown[][]): DataStorageReportReader {
  // Simulate the real reader's aggregated-header resolution: an aggregation renames each aggregated
  // column to "<column> | <FN>" (see resolveReportDataHeaders; no automatic Row Count), so the
  // stream must project rows by those resolved names, not the raw requested columns. A selected
  // calculated field is simulated the same way, one level up: it is ALWAYS appended as its own
  // header + value (resolveReportDataHeaders synthesizes it last, on every branch), regardless of
  // whether the request also carries an aggregation.
  let currentRows: unknown[][] = rows;
  return {
    type: DataStorageType.GOOGLE_BIGQUERY,
    prepareReportData: jest.fn(async (_plan: unknown, options: unknown) => {
      capturedPrepareOptions = options as Record<string, unknown>;
      const opts = options as {
        aggregationConfig?: Array<{ column: string; function: string }>;
        calculatedFields?: Array<{ outputName: string }>;
      };
      const aggregations = opts?.aggregationConfig ?? [];
      const calculatedFields = opts?.calculatedFields ?? [];
      const aggregated = aggregations.length > 0;

      let resultHeaders = headers;
      currentRows = rows;
      if (aggregated) {
        resultHeaders = [
          ...headers.map(header => {
            const fn = aggregations.find(a => a.column === header.name)?.function;
            return fn ? new ReportDataHeader(`${header.name} | ${fn}`) : header;
          }),
        ];
        currentRows = MOCK_AGGREGATED_ROWS;
      }

      if (calculatedFields.length > 0) {
        resultHeaders = [
          ...resultHeaders,
          ...calculatedFields.map(metric => new ReportDataHeader(metric.outputName)),
        ];
        currentRows = currentRows.map(row => [
          ...row,
          ...calculatedFields.map(() => MOCK_CALCULATED_FIELD_VALUE),
        ]);
      }

      return new ReportDataDescription(resultHeaders, currentRows.length);
    }),
    readReportDataBatch: jest.fn(async () => new ReportDataBatch(currentRows, null)),
    finalize: jest.fn(async () => undefined),
    getState: jest.fn(() => null),
    initFromState: jest.fn(async () => undefined),
  } as unknown as DataStorageReportReader;
}

function buildMockResolver(reader: DataStorageReportReader) {
  return {
    resolve: jest.fn(async () => reader),
  } as unknown as TypeResolver<DataStorageType, DataStorageReportReader>;
}

function buildMockBlendableSchema(
  // Include field types so OutputControlsValidatorService can validate operators and
  // date-trunc against column types: `date` is a DATE (so date buckets are valid, and `eq`
  // is still accepted for it), `revenue` is NUMERIC (so `SUM` is valid). No field is a
  // primary key by default — callers that need Unique Count (which requires one) swap the
  // mock's implementation for the duration of their test.
  nativeFields: { name: string; type: string; isPrimaryKey?: boolean }[] = [
    { name: 'date', type: 'DATE' },
    { name: 'revenue', type: 'NUMERIC' },
  ]
) {
  return {
    computeBlendableSchema: jest.fn(async () => ({
      nativeFields,
      blendedFields: [],
      availableSources: [],
      // The real service answers this from the RAW schema, where a key column hidden for
      // reporting still counts. These fixtures carry no hidden fields.
      mainUniqueCountKeyFields: nativeFields
        .filter(f => (f as { isPrimaryKey?: boolean }).isPrimaryKey === true)
        .map(f => f.name),
    })),
  };
}

// Default: no persisted schema fields. Column existence/typing for most tests flows entirely
// through the mocked BlendableSchemaService (buildMockBlendableSchema), never this facade.
// ReportTotalsService is the one caller that reads the persisted DataMart schema directly (see
// deriveTotalsAggregations) — the totals e2e test overrides this mock once, per data mart, with
// realistic fields so a numeric metric resolves.
function buildMockSchemaProviderFacade() {
  return {
    getActualDataMartSchema: jest.fn(
      async (): Promise<{ type: string; fields: Array<Record<string, unknown>> }> => ({
        type: 'bigquery-data-mart-schema',
        fields: [],
      })
    ),
  };
}

// Dummy FQN returned by the DataMartTableReferenceService mock so the
// BigQueryQueryBuilder can compose SQL for the SQL-defined test mart without
// hitting CreateViewService (which requires real credentials).
const DUMMY_FQN = '`proj.ds.tbl`';

function buildMockTableReferenceService() {
  return {
    resolveTableName: jest.fn(async () => DUMMY_FQN),
    ensureSqlViewIsUpToDate: jest.fn(async () => DUMMY_FQN),
  };
}

function parseNdjson(body: string): unknown[] {
  return body
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

// NDJSON carries no separate header block — each row IS the header set, as its object keys.
function headerNamesOf(res: { text: string }): string[] {
  const rows = parseNdjson(res.text) as Record<string, unknown>[];
  return rows.length > 0 ? Object.keys(rows[0]) : [];
}

function buildStoragePermissionDeniedError(): Error {
  const message = 'Access Denied: missing storage permission.';
  const error = new Error(message) as Error & {
    errors: Array<{ reason: string; message: string }>;
    response: { status: { errorResult: { reason: string; message: string } } };
  };
  error.errors = [{ reason: 'accessDenied', message }];
  error.response = { status: { errorResult: { reason: 'accessDenied', message } } };
  return error;
}

describe('HTTP Data API (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataMartId: string;
  let mockReader: DataStorageReportReader;
  let schemaProviderFacadeMock: ReturnType<typeof buildMockSchemaProviderFacade>;
  let blendableSchemaMock: ReturnType<typeof buildMockBlendableSchema>;

  beforeAll(async () => {
    mockReader = buildMockReader(MOCK_HEADERS, MOCK_ROWS);
    schemaProviderFacadeMock = buildMockSchemaProviderFacade();
    blendableSchemaMock = buildMockBlendableSchema();

    const testApp = await createTestApp([
      { provide: DATA_STORAGE_REPORT_READER_RESOLVER, useValue: buildMockResolver(mockReader) },
      { provide: BlendableSchemaService, useValue: blendableSchemaMock },
      { provide: DataMartSchemaProviderFacade, useValue: schemaProviderFacadeMock },
      // Override DataMartTableReferenceService so that output-controls composer
      // tests (Part B) can use the SQL-defined mart without CreateViewService.
      // This override is harmless for tests that don't use output controls.
      { provide: DataMartTableReferenceService, useValue: buildMockTableReferenceService() },
    ]);
    app = testApp.app;
    agent = testApp.agent;

    const prerequisites = await setupPublishedDataMart(agent);
    dataMartId = prerequisites.dataMartId;
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  // Auth: NullIdpProvider in createTestApp() accepts any token (including missing one),
  // so we can't exercise the 401 path here. The decorator stack is the same as for
  // other endpoints — see notification-settings-cross-project.e2e-spec.ts for a
  // multi-tenant IdpProvider example if real 401 coverage is needed.

  describe('Request validation', () => {
    it('returns 400 when column is empty string', async () => {
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(400);
    });

    it('returns 400 when columns=** is combined with exact columns', async () => {
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?columns=**&column=date`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(400);
    });

    it('returns 400 when pageToken is provided', async () => {
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date&pageToken=abc`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(400);
    });

    it('returns 400 when offset is provided', async () => {
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date&offset=10`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(400);
    });

    it('returns 400 for unknown column', async () => {
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=ghost`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(400);
    });

    it('returns 400 for an unknown column in an aggregation rule', async () => {
      const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
      const aggregation = b64([{ column: 'ghost', function: 'SUM' }]);
      const res = await agent
        .get(
          `/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date&column=revenue&aggregation=${aggregation}`
        )
        .set(AUTH_HEADER);
      expect(res.status).toBe(400);
    });

    it('returns 400 for an unknown column in a date-trunc rule', async () => {
      const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
      const dateTrunc = b64([{ column: 'ghost', unit: 'MONTH' }]);
      const res = await agent
        .get(
          `/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date&dateTrunc=${dateTrunc}`
        )
        .set(AUTH_HEADER);
      expect(res.status).toBe(400);
    });

    it('returns 400 when an aggregation is combined with a wildcard column selector', async () => {
      const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
      const aggregation = b64([{ column: 'revenue', function: 'SUM' }]);
      const res = await agent
        .get(
          `/api/external/http-data/data-marts/${dataMartId}.ndjson?columns=*&aggregation=${aggregation}`
        )
        .set(AUTH_HEADER);
      expect(res.status).toBe(400);
    });
  });

  describe('Streaming response (pure NDJSON, no envelope)', () => {
    it('returns 200 with application/x-ndjson and pure data rows', async () => {
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date&column=revenue`)
        .set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/x-ndjson');
      expect(res.headers['x-owox-run-id']).toBeDefined();
      expect(res.headers['x-owox-columns']).toBeUndefined();

      const lines = parseNdjson(res.text);
      expect(lines).toEqual([
        { date: '2026-05-01', revenue: 42.5 },
        { date: '2026-05-02', revenue: 51.0 },
        { date: '2026-05-03', revenue: 100.25 },
      ]);
    });

    it('preserves requested column order in row objects', async () => {
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=revenue&column=date`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(200);
      const firstLine = res.text.split('\n')[0];
      expect(firstLine).toBe('{"revenue":42.5,"date":"2026-05-01"}');
    });

    it('emits no envelope keys (no type/meta/done/error)', async () => {
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.text).not.toMatch(/"type"\s*:/);
      expect(res.text).not.toMatch(/"meta"|"done"/);
    });

    it('streams all native columns when column is omitted', async () => {
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(parseNdjson(res.text)).toEqual([
        { date: '2026-05-01', revenue: 42.5 },
        { date: '2026-05-02', revenue: 51.0 },
        { date: '2026-05-03', revenue: 100.25 },
      ]);
    });

    it('treats columns=* as all native columns', async () => {
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?columns=*`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(parseNdjson(res.text)).toEqual([
        { date: '2026-05-01', revenue: 42.5 },
        { date: '2026-05-02', revenue: 51.0 },
        { date: '2026-05-03', revenue: 100.25 },
      ]);
    });

    it('treats column=* as a literal exact column name', async () => {
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=*`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(400);
    });

    it('de-duplicates repeated columns instead of rejecting them', async () => {
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date&column=date`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.text.split('\n')[0]).toBe('{"date":"2026-05-01"}');
    });
  });

  describe('Legacy non-UUID data mart ids', () => {
    it('does not reject a non-UUID id at routing layer (legacy BigQuery support)', async () => {
      const legacyId = 'legacybigquerydailymetrics';
      const res = await agent
        .get(`/api/external/http-data/data-marts/${legacyId}.ndjson?column=date`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(404);
    });
  });

  describe('Storage error guidance', () => {
    it('returns actionable guidance when storage credentials are denied by the provider', async () => {
      jest
        .mocked(mockReader.prepareReportData)
        .mockRejectedValueOnce(buildStoragePermissionDeniedError());

      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date`)
        .set(AUTH_HEADER);

      expect(res.status).toBe(424);
      expect(res.body).toMatchObject({
        code: 'STORAGE_PERMISSION_DENIED',
        message: expect.stringContaining('returned 403 Forbidden'),
        details: expect.objectContaining({
          dependency: 'storage',
          providerMessage: 'Access Denied: missing storage permission.',
          providerReason: 'accessDenied',
          providerStatusCode: 403,
        }),
      });
    });

    it('returns the provider message instead of an opaque 500 for storage read failures', async () => {
      jest
        .mocked(mockReader.prepareReportData)
        .mockRejectedValueOnce(new Error('Invalid cast from ARRAY<STRING> to STRING at [57:23]'));

      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date`)
        .set(AUTH_HEADER);

      expect(res.status).toBe(424);
      expect(res.body).toMatchObject({
        code: 'STORAGE_READ_FAILED',
        message: expect.stringContaining('Invalid cast from ARRAY<STRING> to STRING'),
      });
    });
  });

  describe('Run history', () => {
    it('creates a HTTP_DATA DataMartRun with manual runType and SUCCESS status', async () => {
      const before = await agent.get(`/api/data-marts/${dataMartId}/runs`).set(AUTH_HEADER);
      const beforeRuns: Array<{ type: string }> = before.body?.runs ?? [];
      const beforeHttpRuns = beforeRuns.filter(r => r.type === 'HTTP_DATA').length;

      await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date`)
        .set(AUTH_HEADER);

      const after = await agent.get(`/api/data-marts/${dataMartId}/runs`).set(AUTH_HEADER);
      const afterRuns: HttpRunView[] = after.body?.runs ?? [];
      const httpRuns = afterRuns.filter(r => r.type === 'HTTP_DATA');
      expect(httpRuns.length).toBe(beforeHttpRuns + 1);

      const newest = httpRuns[0];
      expect(newest.runType).toBe('manual');
      expect(newest.status).toBe('SUCCESS');

      const httpData = newest.additionalParams?.httpData;
      expect(httpData?.format).toBe('ndjson');
      expect(httpData?.columns).toEqual(['date']);
      expect(httpData?.completed).toBe(true);
      expect(httpData?.rowCount).toBe(MOCK_ROWS.length);
      expect(httpData?.bytesWritten).toBeGreaterThan(0);
      expect(httpData?.dataDescription?.dataHeaders?.map(h => h.name)).toEqual(['date', 'revenue']);
    });

    it('records filter/sort/limit in the persisted HTTP_DATA run metadata', async () => {
      const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
      const filter = [{ column: 'date', operator: 'eq', value: '2026-05-01' }];
      const sort = [{ column: 'date', direction: 'asc' }];
      const filterParam = b64(filter);
      const sortParam = b64(sort);

      const before = await agent.get(`/api/data-marts/${dataMartId}/runs`).set(AUTH_HEADER);
      const beforeHttpRuns = ((before.body?.runs ?? []) as Array<{ type: string }>).filter(
        r => r.type === 'HTTP_DATA'
      ).length;

      await agent
        .get(
          `/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date&filter=${filterParam}&sort=${sortParam}&limit=5`
        )
        .set(AUTH_HEADER);

      const after = await agent.get(`/api/data-marts/${dataMartId}/runs`).set(AUTH_HEADER);
      const httpRuns: HttpRunView[] = (after.body?.runs ?? []).filter(
        (r: HttpRunView) => r.type === 'HTTP_DATA'
      );
      expect(httpRuns.length).toBe(beforeHttpRuns + 1);

      const newest = httpRuns[0];
      const httpData = newest.additionalParams?.httpData;
      expect(httpData?.format).toBe('ndjson');
      expect(httpData?.columns).toEqual(['date']);
      expect(httpData?.filter).toEqual(filter);
      expect(httpData?.sort).toEqual(sort);
      expect(httpData?.limit).toBe(5);
      expect(httpData?.completed).toBe(true);
    });

    it('groups by an aggregation and records it in the persisted HTTP_DATA run metadata', async () => {
      const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
      const aggregation = [{ column: 'revenue', function: 'SUM' }];
      const aggregationParam = b64(aggregation);

      const before = await agent.get(`/api/data-marts/${dataMartId}/runs`).set(AUTH_HEADER);
      const beforeHttpRuns = ((before.body?.runs ?? []) as Array<{ type: string }>).filter(
        r => r.type === 'HTTP_DATA'
      ).length;

      const res = await agent
        .get(
          `/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date&column=revenue&aggregation=${aggregationParam}`
        )
        .set(AUTH_HEADER);
      expect(res.status).toBe(200);
      // The streamed rows carry the resolved aggregated header name — the requested
      // `revenue` column is NOT emitted as a bare (null) key, and no Row Count is appended.
      expect(parseNdjson(res.text)).toEqual([{ date: '2026-05-01', 'revenue | SUM': 999 }]);

      const after = await agent.get(`/api/data-marts/${dataMartId}/runs`).set(AUTH_HEADER);
      const httpRuns: HttpRunView[] = (after.body?.runs ?? []).filter(
        (r: HttpRunView) => r.type === 'HTTP_DATA'
      );
      expect(httpRuns.length).toBe(beforeHttpRuns + 1);

      const newest = httpRuns[0];
      const httpData = newest.additionalParams?.httpData;
      expect(httpData?.aggregation).toEqual(aggregation);
      expect(httpData?.completed).toBe(true);
    });

    it('records aggregation + date bucket in the persisted HTTP_DATA run metadata', async () => {
      const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
      const aggregation = [{ column: 'revenue', function: 'SUM' }];
      const dateTrunc = [{ column: 'date', unit: 'MONTH' }];

      const before = await agent.get(`/api/data-marts/${dataMartId}/runs`).set(AUTH_HEADER);
      const beforeHttpRuns = ((before.body?.runs ?? []) as Array<{ type: string }>).filter(
        r => r.type === 'HTTP_DATA'
      ).length;

      const res = await agent
        .get(
          `/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date&column=revenue` +
            `&aggregation=${b64(aggregation)}&dateTrunc=${b64(dateTrunc)}`
        )
        .set(AUTH_HEADER);
      expect(res.status).toBe(200);

      const after = await agent.get(`/api/data-marts/${dataMartId}/runs`).set(AUTH_HEADER);
      const httpRuns: HttpRunView[] = (after.body?.runs ?? []).filter(
        (r: HttpRunView) => r.type === 'HTTP_DATA'
      );
      expect(httpRuns.length).toBe(beforeHttpRuns + 1);

      const httpData = httpRuns[0].additionalParams?.httpData;
      expect(httpData?.aggregation).toEqual(aggregation);
      expect(httpData?.dateTrunc).toEqual(dateTrunc);
      expect(httpData?.completed).toBe(true);
    });

    it('never leaks the authorization token into persisted run metadata', async () => {
      await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date`)
        .set(AUTH_HEADER);

      const after = await agent.get(`/api/data-marts/${dataMartId}/runs`).set(AUTH_HEADER);
      const httpRuns = (after.body?.runs ?? []).filter((r: HttpRunView) => r.type === 'HTTP_DATA');
      const token = AUTH_HEADER['x-owox-authorization'];
      expect(JSON.stringify(httpRuns)).not.toContain(token);
    });
  });

  describe('Report-level HTTP Data', () => {
    let reportDataMartId: string;
    let reportId: string;

    async function createReport(outputControls: Record<string, unknown>): Promise<string> {
      const prereqs = await setupReportPrerequisites(agent);
      reportDataMartId = prereqs.dataMartId;
      const createRes = await agent
        .post('/api/reports')
        .set(AUTH_HEADER)
        .send(
          new ReportBuilder()
            .withDataMartId(prereqs.dataMartId)
            .withDataDestinationId(prereqs.dataDestinationId)
            .build()
        );
      expect(createRes.status).toBe(201);
      const id = createRes.body.id;
      // PUT /api/reports/:id replaces the whole report, so the base (non-output-controls)
      // fields required by UpdateReportRequestApiDto must travel alongside outputControls.
      // (createRes.body.title is "" for a fresh LOOKER_STUDIO report — @IsNotEmpty() on the
      // update DTO rejects that, so a literal non-empty title is used here instead.)
      const put = await agent
        .put(`/api/reports/${id}`)
        .set(AUTH_HEADER)
        .send({
          title: 'Test Report',
          dataDestinationId: prereqs.dataDestinationId,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
          ...outputControls,
        });
      expect(put.status).toBe(200);
      return id;
    }

    beforeAll(async () => {
      reportId = await createReport({
        columnConfig: ['date', 'revenue'],
        filterConfig: [{ column: 'date', operator: 'gte', value: '2026-05-01' }],
      });
    });

    it('streams NDJSON with an x-owox-run-id header', async () => {
      const res = await agent
        .get(`/api/external/http-data/reports/${reportId}.ndjson`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/x-ndjson');
      expect(res.headers['x-owox-run-id']).toBeDefined();
      expect(parseNdjson(res.text).length).toBe(MOCK_ROWS.length);
    });

    it('records a HTTP_DATA run tagged with reportId + executionSqlQuery', async () => {
      const streamed = await agent
        .get(`/api/external/http-data/reports/${reportId}.ndjson`)
        .set(AUTH_HEADER);
      const runId = streamed.headers['x-owox-run-id'];
      const run = await agent
        .get(`/api/data-marts/${reportDataMartId}/runs/${runId}`)
        .set(AUTH_HEADER);
      expect(run.status).toBe(200);
      expect(run.body.type).toBe('HTTP_DATA');
      expect(run.body.reportId).toBe(reportId);
      expect(run.body.additionalParams?.httpData?.executionSqlQuery).toEqual(expect.any(String));
      expect(run.body.additionalParams?.httpData?.filter).toEqual([
        { column: 'date', operator: 'gte', value: '2026-05-01' },
      ]);
    });

    it('accepts a ?limit= override and records it', async () => {
      const streamed = await agent
        .get(`/api/external/http-data/reports/${reportId}.ndjson?limit=1`)
        .set(AUTH_HEADER);
      expect(streamed.status).toBe(200);
      const runId = streamed.headers['x-owox-run-id'];
      const run = await agent
        .get(`/api/data-marts/${reportDataMartId}/runs/${runId}`)
        .set(AUTH_HEADER);
      expect(run.body.additionalParams?.httpData?.limit).toBe(1);
    });

    it('returns 400 for any query param other than limit', async () => {
      const res = await agent
        .get(`/api/external/http-data/reports/${reportId}.ndjson?filter=abc`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(400);
    });

    it('returns 404 for an unknown report id', async () => {
      const res = await agent
        .get(`/api/external/http-data/reports/00000000-0000-0000-0000-000000000000.ndjson`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(404);
    });

    // ReportTotalsService derives totals eligibility from the persisted DataMart schema (see
    // deriveTotalsAggregations in report-sql-composer.service.ts), NOT from the mocked
    // BlendableSchemaService that the rest of this file relies on for column resolution. The
    // default schema-provider mock (buildMockSchemaProviderFacade) returns no fields, so this
    // report's fresh Data Mart needs a one-time override — mirroring the same date/revenue field
    // types already used by buildMockBlendableSchema — so `revenue` resolves as a NUMERIC totals
    // metric and the aggregated report actually produces a grand-totals row.
    it('returns grand totals in run history for an aggregated report', async () => {
      schemaProviderFacadeMock.getActualDataMartSchema.mockResolvedValueOnce({
        type: 'bigquery-data-mart-schema',
        fields: [
          { name: 'date', type: 'DATE', mode: 'NULLABLE', status: 'CONNECTED' },
          { name: 'revenue', type: 'NUMERIC', mode: 'NULLABLE', status: 'CONNECTED' },
        ],
      });

      const aggregatedReportId = await createReport({
        columnConfig: ['date', 'revenue'],
        aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
      });
      const streamed = await agent
        .get(`/api/external/http-data/reports/${aggregatedReportId}.ndjson`)
        .set(AUTH_HEADER);
      expect(streamed.status).toBe(200);
      const runId = streamed.headers['x-owox-run-id'];
      const run = await agent
        .get(`/api/data-marts/${reportDataMartId}/runs/${runId}`)
        .set(AUTH_HEADER);
      // `totals` is surfaced at the TOP LEVEL of the run response only — HttpDataMapper
      // deliberately strips it out of additionalParams.httpData (see maskAdditionalParams /
      // extractTotals in data-mart.mapper.ts) so it isn't duplicated in the masked view.
      expect(run.body.additionalParams?.httpData?.totals).toBeUndefined();
      expect(run.body.totals).toBeDefined();
      expect(Object.keys(run.body.totals as Record<string, unknown>).length).toBeGreaterThan(0);
    });

    // Unique Count requires a primary-key field on the data mart schema (see
    // UNIQUE_COUNT_REQUIRES_PRIMARY_KEY in output-controls-validator.service.ts) — both when
    // the report is saved (PUT) AND on every subsequent read (resolveBlendingDecision
    // revalidates output controls as a schema-drift guard). buildMockBlendableSchema's default
    // has no primary key, so the mock's implementation is swapped for the duration of this test
    // and restored after — this is a smoke test that uniqueCountConfig flows end-to-end through
    // save + stream + run recording, not a check of a computed distinct count (the mock reader
    // returns fixed rows regardless of the composed SQL).
    it('streams a report with uniqueCountConfig and records a HTTP_DATA run', async () => {
      const originalImpl = blendableSchemaMock.computeBlendableSchema.getMockImplementation();
      blendableSchemaMock.computeBlendableSchema.mockImplementation(async () => ({
        nativeFields: [
          { name: 'date', type: 'DATE', isPrimaryKey: true },
          { name: 'revenue', type: 'NUMERIC' },
        ],
        blendedFields: [],
        availableSources: [],
        mainUniqueCountKeyFields: ['date'],
      }));

      try {
        const uniqueCountReportId = await createReport({
          columnConfig: ['date', 'revenue'],
          uniqueCountConfig: true,
        });

        const streamed = await agent
          .get(`/api/external/http-data/reports/${uniqueCountReportId}.ndjson`)
          .set(AUTH_HEADER);
        expect(streamed.status).toBe(200);
        const runId = streamed.headers['x-owox-run-id'];
        expect(runId).toBeDefined();

        const run = await agent
          .get(`/api/data-marts/${reportDataMartId}/runs/${runId}`)
          .set(AUTH_HEADER);
        expect(run.status).toBe(200);
        expect(run.body.type).toBe('HTTP_DATA');
        expect(run.body.reportId).toBe(uniqueCountReportId);
      } finally {
        blendableSchemaMock.computeBlendableSchema.mockImplementation(originalImpl!);
      }
    });
  });

  describe('No persistence side effects', () => {
    it('creates neither a Report nor a DataDestination row', async () => {
      const reportRepo = app.get<Repository<Report>>(getRepositoryToken(Report));
      const destinationRepo = app.get<Repository<DataDestination>>(
        getRepositoryToken(DataDestination)
      );
      const reportsBefore = await reportRepo.count();
      const destinationsBefore = await destinationRepo.count();

      await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date&column=revenue`)
        .set(AUTH_HEADER);

      expect(await reportRepo.count()).toBe(reportsBefore);
      expect(await destinationRepo.count()).toBe(destinationsBefore);
    });
  });

  // ---------------------------------------------------------------------------
  // Part A: Output controls — request validation (400 before composer runs)
  // ---------------------------------------------------------------------------
  // These tests exercise base64url param parsing and FilterConfig/SortConfig/limit
  // schema validation. All rejections happen in HttpDataQuerySchema.parse() before
  // any composer logic is invoked — no risk of hitting the CreateView wall.
  // ---------------------------------------------------------------------------
  describe('Output controls — request validation', () => {
    const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

    it('returns 400 for malformed base64url filter', async () => {
      const res = await agent
        .get(
          `/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date&filter=@@@notbase64@@@`
        )
        .set(AUTH_HEADER);
      expect(res.status).toBe(400);
    });

    it('returns 400 for valid base64url but invalid FilterConfig shape (unknown operator)', async () => {
      const invalid = b64([{ column: 'date', operator: 'NOT_A_REAL_OP', value: '2026-05-01' }]);
      const res = await agent
        .get(
          `/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date&filter=${invalid}`
        )
        .set(AUTH_HEADER);
      expect(res.status).toBe(400);
    });

    it('returns 400 for valid base64url but invalid SortConfig shape (unknown direction)', async () => {
      const invalid = b64([{ column: 'date', direction: 'sideways' }]);
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date&sort=${invalid}`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(400);
    });

    it('returns 400 when limit=0 (below minimum of 1)', async () => {
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date&limit=0`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(400);
    });

    it('returns 400 when limit is a non-integer float', async () => {
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date&limit=1.5`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // Part B: Output controls actually applied (happy-path, B2 approach)
  // ---------------------------------------------------------------------------
  // Proves that a valid filter+sort+limit reach the ReportSqlComposerService and
  // the composed sqlOverride is handed to the reader. The DataMartTableReferenceService
  // is mocked (dummy FQN) so the SQL-defined test mart bypasses CreateViewService
  // entirely. The mock reader captures the options passed to prepareReportData.
  // ---------------------------------------------------------------------------
  describe('Output controls — applied (filter/sort/limit flow through composer)', () => {
    const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

    beforeEach(() => {
      capturedPrepareOptions = null;
    });

    it('sends a composed sqlOverride to the reader that reflects filter, sort, and limit', async () => {
      const filter = b64([{ column: 'date', operator: 'eq', value: '2026-05-01' }]);
      const sort = b64([{ column: 'date', direction: 'asc' }]);

      const res = await agent
        .get(
          `/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date&filter=${filter}&sort=${sort}&limit=2`
        )
        .set(AUTH_HEADER);

      expect(res.status).toBe(200);
      // Mock reader still returns all MOCK_ROWS regardless of limit (limit is
      // applied by the storage layer in production; the mock ignores it).
      // We assert on the NDJSON output using only the date column.
      const rows = parseNdjson(res.text);
      expect(rows.length).toBe(MOCK_ROWS.length);
      expect(rows[0]).toHaveProperty('date');

      // The prepareReportData options must contain a composed sqlOverride
      expect(capturedPrepareOptions).not.toBeNull();
      const sqlOverride = capturedPrepareOptions!['sqlOverride'] as string;
      const sqlOverrideParams = capturedPrepareOptions!['sqlOverrideParams'] as unknown[];

      // sqlOverride must use the dummy FQN as the FROM clause
      expect(typeof sqlOverride).toBe('string');
      expect(sqlOverride).toContain(DUMMY_FQN);

      // BigQuery renderer uses @<paramName> placeholders for filter values
      expect(sqlOverride).toMatch(/@\w+/);

      // WHERE clause must reference the `date` column (backtick-quoted in BQ)
      expect(sqlOverride).toContain('`date`');

      // ORDER BY clause must be present for sort
      expect(sqlOverride.toUpperCase()).toContain('ORDER BY');

      // LIMIT clause must be present
      expect(sqlOverride.toUpperCase()).toContain('LIMIT');

      // sqlOverrideParams carries the filter value ('2026-05-01')
      expect(Array.isArray(sqlOverrideParams)).toBe(true);
      expect((sqlOverrideParams as unknown[]).length).toBeGreaterThan(0);
    });

    it('sends no sqlOverride when no output controls are present', async () => {
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=date`)
        .set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(capturedPrepareOptions).not.toBeNull();
      // Without output controls the service skips the composer path entirely —
      // sqlOverride is undefined (not set).
      expect(capturedPrepareOptions!['sqlOverride']).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Calculated fields — composition-time guards
  // ---------------------------------------------------------------------------
  // A dedicated Data Mart + schema (not the shared `dataMartId`, whose schema every earlier test
  // in this file relies on staying `date`/`revenue`-shaped): `country`/`clicks`/`impressions` plus
  // a calculated `ctr`. `ReportSqlComposerService` and `OutputControlsValidatorService` are REAL
  // (not overridden) — only the DWH read (`mockReader`) and `BlendableSchemaService` are mocked —
  // so the composition and header-synthesis pipeline that decides whether `ctr` is a "known"
  // column runs for real; only the SQL's actual EXECUTION is faked.
  // ---------------------------------------------------------------------------
  describe('Calculated fields — composition-time guards', () => {
    const CTR_FORMULA = 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';
    let dataMartWithCtrId: string;
    let restoreBlendableSchema: (() => void) | undefined;

    beforeAll(async () => {
      const prereqs = await setupPublishedDataMart(agent);
      dataMartWithCtrId = prereqs.dataMartId;

      const schemaRes = await agent
        .put(`/api/data-marts/${dataMartWithCtrId}/schema`)
        .set(AUTH_HEADER)
        .send({
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
                calculated: { formula: CTR_FORMULA, level: 'metric' },
              },
            ],
          },
        });
      expect(schemaRes.status).toBe(200);

      // HttpDataColumnResolver / HttpDataColumnValidator / OutputControlsValidatorService all
      // read through the mocked BlendableSchemaService, never the persisted schema directly (that
      // is what ReportSqlComposerService reads, for the formula itself) — mirror the PUT above so
      // the mocked and persisted schemas agree, or `brokenReferencesOf` would see `clicks`/
      // `impressions` as missing and reject every request as a broken metric.
      const originalBlendableImpl =
        blendableSchemaMock.computeBlendableSchema.getMockImplementation();
      blendableSchemaMock.computeBlendableSchema.mockImplementation(async () => ({
        nativeFields: [
          { name: 'country', type: 'STRING' },
          { name: 'clicks', type: 'INTEGER' },
          { name: 'impressions', type: 'INTEGER' },
          { name: 'ctr', type: 'FLOAT', calculated: { formula: CTR_FORMULA, level: 'metric' } },
        ],
        blendedFields: [],
        availableSources: [],
        mainUniqueCountKeyFields: [],
      }));

      // executeStream calls actualizeSchemaInEntityIfExpired on every request, which re-merges
      // the persisted schema against this mock's (otherwise EMPTY, per buildMockSchemaProviderFacade)
      // "actual" warehouse fields — dropping `country`/`clicks`/`impressions` as no longer present
      // upstream. `ctr` alone would survive that (a calculated field is carried through the merge
      // untouched — it never comes from the warehouse), but the OTHER fields ctr's formula
      // references would vanish, and every request would 400 as a broken metric. Mirror the real
      // warehouse table shape here too (a calculated field is never among ITS columns either).
      const originalSchemaProviderImpl =
        schemaProviderFacadeMock.getActualDataMartSchema.getMockImplementation();
      schemaProviderFacadeMock.getActualDataMartSchema.mockImplementation(async () => ({
        type: 'bigquery-data-mart-schema',
        fields: [
          { name: 'country', type: 'STRING', mode: 'NULLABLE', status: 'CONNECTED' },
          { name: 'clicks', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
          { name: 'impressions', type: 'INTEGER', mode: 'NULLABLE', status: 'CONNECTED' },
        ],
      }));

      restoreBlendableSchema = () => {
        blendableSchemaMock.computeBlendableSchema.mockImplementation(originalBlendableImpl!);
        schemaProviderFacadeMock.getActualDataMartSchema.mockImplementation(
          originalSchemaProviderImpl!
        );
      };
    });

    afterAll(() => {
      restoreBlendableSchema?.();
    });

    it('does not include a calculated field in an implicit-all projection', async () => {
      for (const query of ['', '?columns=*', '?columns=**']) {
        const res = await agent
          .get(`/api/external/http-data/data-marts/${dataMartWithCtrId}.ndjson${query}`)
          .set(AUTH_HEADER);
        expect(res.status).toBe(200);
        expect(headerNamesOf(res)).not.toContain('ctr');
      }
    });

    it('includes it when explicitly selected', async () => {
      const res = await agent
        .get(
          `/api/external/http-data/data-marts/${dataMartWithCtrId}.ndjson?column=ctr&column=country`
        )
        .set(AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(headerNamesOf(res)).toContain('ctr');
    });

    // Pins the `outputColumns` gate in stream-http-data.service.ts: a selected metric
    // IS an aggregate even with no `aggregation=` param, so the gate that decides whether to
    // project by resolved headers or the raw request must recognize `calculatedFields`, not only
    // `aggregationConfig` — else a column it does not recognise streams as a silent `null`.
    //
    // `typeof row.ctr === 'number'` ALONE cannot see the gate: `buildFieldIndexMap` binds by NAME,
    // and `ctr` is present in both candidate lists, so the metric's own value arrives either way.
    // What the gate actually decides is WHICH list names the emitted columns — the resolved
    // headers, or the raw `?column=` request. Assert the whole key set: the reader resolves
    // headers independently of request order (here `date, revenue, ctr`), so dropping the
    // `calculatedFields` term makes the stream emit the request's `ctr, country` instead — with
    // `country` as the silent `null` this gate exists to prevent.
    it('streams the metric as a number, and names columns by the resolved headers', async () => {
      const res = await agent
        .get(
          `/api/external/http-data/data-marts/${dataMartWithCtrId}.ndjson?column=ctr&column=country`
        )
        .set(AUTH_HEADER);
      expect(res.status).toBe(200);

      const rows = parseNdjson(res.text) as Record<string, unknown>[];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(typeof row.ctr).toBe('number');
        expect(Object.keys(row)).toEqual(['date', 'revenue', 'ctr']);
      }
    });

    it('rejects an aggregation applied to the calculated field', async () => {
      const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
      const aggregation = b64([{ column: 'ctr', function: 'SUM' }]);

      const res = await agent
        .get(
          `/api/external/http-data/data-marts/${dataMartWithCtrId}.ndjson?column=ctr&aggregation=${aggregation}`
        )
        .set(AUTH_HEADER);

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        details: {
          errors: expect.arrayContaining([
            expect.objectContaining({ code: 'AGGREGATION_ON_CALCULATED_FIELD' }),
          ]),
        },
      });
    });
  });
});
