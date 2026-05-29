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

function buildMockReader(headers: ReportDataHeader[], rows: unknown[][]): DataStorageReportReader {
  return {
    type: DataStorageType.GOOGLE_BIGQUERY,
    prepareReportData: jest.fn(async () => new ReportDataDescription(headers, rows.length)),
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
      nativeFields: [{ name: 'date' }, { name: 'revenue' }],
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

function parseNdjson(body: string): unknown[] {
  return body
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
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

    it('returns 400 when ** is combined with other columns', async () => {
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=**&column=date`)
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

    it('treats * as all native columns', async () => {
      const res = await agent
        .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson?column=*`)
        .set(AUTH_HEADER);
      expect(res.status).toBe(200);
      expect(parseNdjson(res.text)).toEqual([
        { date: '2026-05-01', revenue: 42.5 },
        { date: '2026-05-02', revenue: 51.0 },
        { date: '2026-05-03', revenue: 100.25 },
      ]);
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
});
