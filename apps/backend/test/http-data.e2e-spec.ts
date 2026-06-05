import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import * as supertest from 'supertest';
import { AUTH_HEADER, closeTestApp, createTestApp, setupPublishedDataMart } from '@owox/test-utils';
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

function buildMockReader(headers: ReportDataHeader[], rows: unknown[][]): DataStorageReportReader {
  return {
    type: DataStorageType.GOOGLE_BIGQUERY,
    prepareReportData: jest.fn(async (_plan: unknown, options: unknown) => {
      capturedPrepareOptions = options as Record<string, unknown>;
      return new ReportDataDescription(headers, rows.length);
    }),
    readReportDataBatch: jest.fn(async () => new ReportDataBatch(rows, null)),
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

function buildMockBlendableSchema() {
  return {
    computeBlendableSchema: jest.fn(async () => ({
      // Include field types so OutputControlsValidatorService can validate
      // filter operators against column types (e.g. 'eq' is valid for STRING).
      nativeFields: [
        { name: 'date', type: 'STRING' },
        { name: 'revenue', type: 'NUMERIC' },
      ],
      blendedFields: [],
      availableSources: [],
    })),
  };
}

function buildMockSchemaProviderFacade() {
  return {
    getActualDataMartSchema: jest.fn(async () => ({
      type: 'bigquery-data-mart-schema',
      fields: [],
    })),
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

  beforeAll(async () => {
    mockReader = buildMockReader(MOCK_HEADERS, MOCK_ROWS);

    const testApp = await createTestApp([
      { provide: DATA_STORAGE_REPORT_READER_RESOLVER, useValue: buildMockResolver(mockReader) },
      { provide: BlendableSchemaService, useValue: buildMockBlendableSchema() },
      { provide: DataMartSchemaProviderFacade, useValue: buildMockSchemaProviderFacade() },
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
});
