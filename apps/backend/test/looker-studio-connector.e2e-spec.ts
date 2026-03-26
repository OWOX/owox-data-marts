import { INestApplication } from '@nestjs/common';
import * as crypto from 'crypto';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  setupReportPrerequisites,
  ReportBuilder,
  AUTH_HEADER,
  signLookerPayload,
  mockGoogleJwkFetch,
  restoreGoogleJwkFetch,
} from '@owox/test-utils';
import { ReportDataCacheService } from '../src/data-marts/services/report-data-cache.service';
import { DataMartSchemaProviderFacade } from '../src/data-marts/data-storage-types/facades/data-mart-schema-provider.facade';
import { ReportDataHeader } from '../src/data-marts/dto/domain/report-data-header.dto';
import { ReportDataBatch } from '../src/data-marts/dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../src/data-marts/dto/domain/report-data-description.dto';
import { BigQueryFieldType } from '../src/data-marts/data-storage-types/bigquery/enums/bigquery-field-type.enum';

// ---------------------------------------------------------------------------
// Mock data for the in-memory reader
// ---------------------------------------------------------------------------
const MOCK_HEADERS: ReportDataHeader[] = [
  new ReportDataHeader('date', 'Date', 'Report date', BigQueryFieldType.STRING),
  new ReportDataHeader('revenue', 'Revenue', 'Total revenue', BigQueryFieldType.FLOAT),
];

const MOCK_ROWS: unknown[][] = [
  ['2024-01-01', 42.5],
  ['2024-01-02', 100.0],
  ['2024-01-03', 75.25],
];

const mockReader = {
  prepareReportData: jest
    .fn()
    .mockResolvedValue(new ReportDataDescription(MOCK_HEADERS, MOCK_ROWS.length)),
  readReportDataBatch: jest.fn().mockResolvedValue(new ReportDataBatch(MOCK_ROWS, null)),
  finalize: jest.fn().mockResolvedValue(undefined),
  getState: jest.fn().mockReturnValue(null),
  initFromState: jest.fn().mockResolvedValue(undefined),
  getType: jest.fn().mockReturnValue('GOOGLE_BIGQUERY'),
};

const mockCacheService = {
  getOrCreateCachedReader: jest.fn().mockResolvedValue({
    reader: mockReader,
    dataDescription: new ReportDataDescription(MOCK_HEADERS, MOCK_ROWS.length),
    fromCache: false,
  }),
};

const mockSchemaProviderFacade = {
  getActualDataMartSchema: jest.fn().mockResolvedValue({
    type: 'bigquery-data-mart-schema',
    fields: [],
  }),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Looker Studio Connector (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;

  let destinationId: string;
  let destinationSecretKey: string;
  let reportId: string;

  /** Send a signed JWT request to a Looker Studio endpoint. */
  function postLooker(path: string, payload: unknown): supertest.Test {
    return agent.post(path).set('Content-Type', 'application/jwt').send(signLookerPayload(payload));
  }

  beforeAll(async () => {
    mockGoogleJwkFetch();

    const testApp = await createTestApp([
      { provide: ReportDataCacheService, useValue: mockCacheService },
      { provide: DataMartSchemaProviderFacade, useValue: mockSchemaProviderFacade },
    ]);
    app = testApp.app;
    agent = testApp.agent;

    // Create prerequisite chain: storage -> data mart -> definition -> publish -> destination
    const prerequisites = await setupReportPrerequisites(agent);
    destinationId = prerequisites.dataDestinationId;

    // Seed storage credentials directly in DB (the Looker Studio queries use
    // INNER JOIN on storage.credential which requires it to exist).
    /* eslint-disable @typescript-eslint/no-require-imports */
    const backendRoot = require.resolve('@owox/backend/package.json');
    const backendDir = require('path').dirname(backendRoot);
    const { DataSource } = require(require.resolve('typeorm', { paths: [backendDir] }));
    /* eslint-enable @typescript-eslint/no-require-imports */
    const dataSource = app.get(DataSource);
    const credentialId = crypto.randomUUID();
    await dataSource.query(
      `INSERT INTO data_storage_credentials (id, projectId, type, credentials, createdAt, modifiedAt)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [credentialId, '0', 'google_service_account', JSON.stringify({ type: 'test-credentials' })]
    );
    await dataSource.query(`UPDATE data_storage SET config = ?, credentialId = ? WHERE id = ?`, [
      JSON.stringify({ projectId: 'test-project', dataset: 'test_dataset' }),
      credentialId,
      prerequisites.storageId,
    ]);

    // Read destination to get the auto-generated secret key
    const destRes = await agent.get(`/api/data-destinations/${destinationId}`).set(AUTH_HEADER);
    destinationSecretKey = destRes.body.credentials.destinationSecretKey;

    // Create a report linked to the data mart and destination
    const reportPayload = new ReportBuilder()
      .withDataMartId(prerequisites.dataMartId)
      .withDataDestinationId(destinationId)
      .build();
    const reportRes = await agent.post('/api/reports').set(AUTH_HEADER).send(reportPayload);
    expect(reportRes.status).toBe(201);
    reportId = reportRes.body.id;
  }, 120_000);

  afterAll(async () => {
    restoreGoogleJwkFetch();
    await closeTestApp(app);
  });

  // Reset mock call counts between tests
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-set default mock return values after clearAllMocks
    mockCacheService.getOrCreateCachedReader.mockResolvedValue({
      reader: mockReader,
      dataDescription: new ReportDataDescription(MOCK_HEADERS, MOCK_ROWS.length),
      fromCache: false,
    });
    mockReader.readReportDataBatch.mockResolvedValue(new ReportDataBatch(MOCK_ROWS, null));
    mockSchemaProviderFacade.getActualDataMartSchema.mockResolvedValue({
      type: 'bigquery-data-mart-schema',
      fields: [],
    });
  });

  // -------------------------------------------------------------------------
  // get-config
  // -------------------------------------------------------------------------
  describe('POST /api/external/looker/get-config', () => {
    // LS-01
    // Flow: JWT(payload) → GoogleJwtBody validates signature via mocked Google JWK
    //   → ConfigService.getConfig()
    //   → ConnectionConfigSchema.safeParse(connectionConfig) → OK
    //   → ReportService.getAllByDestinationIdAndLookerStudioSecret(destId, secret)
    //       SQL: JOIN destinations + credentials, JSON_EXTRACT($.destinationSecretKey) = secret
    //       → [report]
    //   → builds reportSelector with options: [{ value: reportId, label: dataMart.title }]
    //   → 200 { configParams: [{ name: 'reportId', type: 'SELECT_SINGLE', options }] }
    it('returns configParams with report selector for valid request', async () => {
      const res = await postLooker('/api/external/looker/get-config', {
        connectionConfig: {
          deploymentUrl: 'http://localhost',
          destinationId,
          destinationSecretKey,
        },
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('configParams');
      expect(Array.isArray(res.body.configParams)).toBe(true);

      const reportSelector = res.body.configParams.find(
        (p: Record<string, unknown>) => p.name === 'reportId'
      );
      expect(reportSelector).toBeDefined();
      expect(reportSelector.type).toBe('SELECT_SINGLE');
      expect(reportSelector.options).toEqual(
        expect.arrayContaining([expect.objectContaining({ value: reportId })])
      );
    });

    // LS-02
    // Flow: JWT(payload) → GoogleJwtBody → OK
    //   → ConfigService.getConfig()
    //   → ConnectionConfigSchema.safeParse({ missing: 'fields' }) → FAIL (Zod: required fields)
    //   → throw BusinessViolationException('Incompatible request config')
    //   → 400
    it('returns error for invalid connectionConfig', async () => {
      const res = await postLooker('/api/external/looker/get-config', {
        connectionConfig: { missing: 'fields' },
      });

      expect(res.status).toBe(400);
    });

    // LS-03
    // Flow: JWT(payload) → GoogleJwtBody → OK
    //   → ConfigService.getConfig()
    //   → ConnectionConfigSchema.safeParse() → OK
    //   → ReportService.getAllByDestinationIdAndLookerStudioSecret(destId, 'wrong-secret')
    //       SQL: JSON_EXTRACT($.destinationSecretKey) = 'wrong-secret' → no match
    //       → []
    //   → reportSelector.options = []
    //   → 200 { configParams: [{ options: [] }] }
    it('returns empty options for wrong destinationSecretKey', async () => {
      const res = await postLooker('/api/external/looker/get-config', {
        connectionConfig: {
          deploymentUrl: 'http://localhost',
          destinationId,
          destinationSecretKey: 'wrong-secret-key',
        },
      });

      expect(res.status).toBe(200);
      const reportSelector = res.body.configParams.find(
        (p: Record<string, unknown>) => p.name === 'reportId'
      );
      expect(reportSelector.options).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // get-schema
  // -------------------------------------------------------------------------
  describe('POST /api/external/looker/get-schema', () => {
    // LS-04
    // Flow: JWT(payload) → GoogleJwtBody → OK
    //   → ApiService.getSchema()
    //   → validateAndExtractRequestData(): ConnectionConfig + ConfigParams → OK
    //   → ReportService.getByIdAndLookerStudioSecret(reportId, secret) → report
    //   → ReportDataCacheService.getOrCreateCachedReader() → [MOCK: headers date:STRING, revenue:FLOAT]
    //   → SchemaService.getSchema()
    //       → DataMartSchemaProviderFacade.getActualDataMartSchema() → [MOCK: empty]
    //       → getSchemaFields(mockHeaders, GOOGLE_BIGQUERY)
    //           date:BQ_STRING  → LookerTypeMapper → STRING  + semantics: DIMENSION
    //           revenue:BQ_FLOAT → LookerTypeMapper → NUMBER + semantics: METRIC, aggregation: SUM
    //   → 200 { schema: [{ name, dataType, label, semantics }] }
    it('returns schema fields for valid request', async () => {
      const res = await postLooker('/api/external/looker/get-schema', {
        connectionConfig: {
          deploymentUrl: 'http://localhost',
          destinationId,
          destinationSecretKey,
        },
        request: {
          configParams: { destinationId, reportId },
        },
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('schema');
      expect(Array.isArray(res.body.schema)).toBe(true);
      expect(res.body.schema).toHaveLength(MOCK_HEADERS.length);

      // Verify field names match our mock headers
      const fieldNames = res.body.schema.map((f: Record<string, unknown>) => f.name);
      expect(fieldNames).toContain('date');
      expect(fieldNames).toContain('revenue');

      // Verify type mapping: BQ STRING -> Looker STRING, BQ FLOAT -> Looker NUMBER
      const dateField = res.body.schema.find((f: Record<string, unknown>) => f.name === 'date');
      expect(dateField.dataType).toBe('STRING');

      const revenueField = res.body.schema.find(
        (f: Record<string, unknown>) => f.name === 'revenue'
      );
      expect(revenueField.dataType).toBe('NUMBER');
    });

    // LS-05
    // Flow: JWT → OK → validateAndExtractRequestData() → OK
    //   → ReportService.getByIdAndLookerStudioSecret('non-existent', secret) → null
    //   → throw BusinessViolationException('No report found...')
    //   → 400
    it('returns error for invalid reportId', async () => {
      const res = await postLooker('/api/external/looker/get-schema', {
        connectionConfig: {
          deploymentUrl: 'http://localhost',
          destinationId,
          destinationSecretKey,
        },
        request: {
          configParams: { destinationId, reportId: 'non-existent-report-id' },
        },
      });

      expect(res.status).toBe(400);
    });

    // LS-06
    // Flow: JWT → OK → validateAndExtractRequestData()
    //   → configParams = undefined
    //   → throw BusinessViolationException('Request configParams not provided')
    //   → 400
    it('returns error for missing configParams', async () => {
      const res = await postLooker('/api/external/looker/get-schema', {
        connectionConfig: {
          deploymentUrl: 'http://localhost',
          destinationId,
          destinationSecretKey,
        },
        request: {},
      });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // get-data
  // -------------------------------------------------------------------------
  describe('POST /api/external/looker/get-data', () => {
    // LS-07
    // Flow: JWT → OK → validate → report → cachedReader [MOCK]
    //   → sampleExtraction = undefined → FULL extraction
    //   → getDataStreaming()
    //       isStreamingEnabled() → false (env not set)
    //       → getFullDataExtraction()
    //           ReportRunService.create(report) → reportRun record in DB
    //           ProjectBalanceService.verifyCanPerformOperations() → OK (not configured in test)
    //           DataService.getData(request, report, cachedReader)
    //             prepareHeadersAndMapping([date,revenue], fields:[date,revenue])
    //               → filteredHeaders: [date, revenue], fieldIndexMap: [0, 1]
    //             readAndProcessData(mockReader, [0,1], limit=1_000_000)
    //               mockReader.readReportDataBatch() → 3 rows, nextBatchId: null
    //               rows[i].values = fieldIndexMap.map(idx => convertToFieldValue(row[idx]))
    //             buildResponseSchema(headers, GOOGLE_BIGQUERY) → [{date:STRING}, {revenue:NUMBER}]
    //           handleSuccessfulReportRun() → markAsSuccess, skip consumption (no PubSub)
    //       res.json(result)
    //   → 200 { schema, rows, filtersApplied }
    it('returns schema and rows for valid request', async () => {
      const res = await postLooker('/api/external/looker/get-data', {
        connectionConfig: {
          deploymentUrl: 'http://localhost',
          destinationId,
          destinationSecretKey,
        },
        request: {
          configParams: { destinationId, reportId },
          fields: [{ name: 'date' }, { name: 'revenue' }],
        },
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('schema');
      expect(res.body).toHaveProperty('rows');
      expect(Array.isArray(res.body.schema)).toBe(true);
      expect(Array.isArray(res.body.rows)).toBe(true);

      // Verify schema matches requested fields
      expect(res.body.schema).toHaveLength(2);
      expect(res.body.schema[0].name).toBe('date');
      expect(res.body.schema[1].name).toBe('revenue');

      // Verify rows contain actual data
      expect(res.body.rows).toHaveLength(MOCK_ROWS.length);
      expect(res.body.rows[0].values).toEqual(['2024-01-01', 42.5]);
      expect(res.body.rows[1].values).toEqual(['2024-01-02', 100.0]);
    });

    // LS-08
    // Flow: JWT → OK → validate → report → cachedReader [MOCK]
    //   → scriptParams.sampleExtraction = true
    //   → getDataStreaming()
    //       → getSampleDataExtraction()  ← does NOT create reportRun
    //           DataService.getData(request, report, cachedReader, isSample=true)
    //             effectiveRowLimit = 100  ← hardcoded for samples
    //             readAndProcessData(reader, indexMap, limit=100) → 3 rows (< 100, returns all)
    //       res.json(result)
    //   → 200 { rows: [...] }  (rows.length <= 100)
    it('returns data for sample extraction', async () => {
      const res = await postLooker('/api/external/looker/get-data', {
        connectionConfig: {
          deploymentUrl: 'http://localhost',
          destinationId,
          destinationSecretKey,
        },
        request: {
          configParams: { destinationId, reportId },
          scriptParams: { sampleExtraction: true },
          fields: [{ name: 'date' }, { name: 'revenue' }],
        },
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('rows');
      expect(res.body.rows.length).toBeGreaterThan(0);
      expect(res.body.rows.length).toBeLessThanOrEqual(100);
    });

    // LS-09
    // Flow: JWT → OK → validateAndExtractRequestData() → OK
    //   → ReportService.getByIdAndLookerStudioSecret('non-existent', secret) → null
    //   → throw BusinessViolationException('No report found...')
    //   → 400
    it('returns error for invalid reportId', async () => {
      const res = await postLooker('/api/external/looker/get-data', {
        connectionConfig: {
          deploymentUrl: 'http://localhost',
          destinationId,
          destinationSecretKey,
        },
        request: {
          configParams: { destinationId, reportId: 'non-existent-report-id' },
          fields: [{ name: 'date' }],
        },
      });

      expect(res.status).toBe(400);
    });

    // LS-10
    // Flow: JWT → OK → validate → report → cachedReader [MOCK]
    //   → getFullDataExtraction()
    //       ReportRunService.create() → reportRun
    //       DataService.getData()
    //         prepareHeadersAndMapping([date,revenue], fields:[nonexistent_field])
    //           filteredHeaders = [date,revenue].filter(h => ['nonexistent_field'].includes(h.name))
    //           → filteredHeaders = []  ← empty!
    //           → throw BusinessViolationException('No valid fields found in the request')
    //       handleFailedReportRun() → markAsUnsuccessful in DB
    //   → 400
    it('returns error for non-existent field name', async () => {
      const res = await postLooker('/api/external/looker/get-data', {
        connectionConfig: {
          deploymentUrl: 'http://localhost',
          destinationId,
          destinationSecretKey,
        },
        request: {
          configParams: { destinationId, reportId },
          fields: [{ name: 'nonexistent_field' }],
        },
      });

      expect(res.status).toBe(400);
    });

    // LS-07b
    // Flow: same as LS-07, but fields: [{ name: 'revenue' }] (subset)
    //   → prepareHeadersAndMapping([date,revenue], fields:[revenue])
    //       filteredHeaders: [revenue], fieldIndexMap: [1]  ← index 1 = revenue column
    //   → readAndProcessData()
    //       row.values = fieldIndexMap.map(i => row[i]) → [row[1]] → [42.5]
    //   → schema has 1 field, rows have 1 value each
    it('returns only requested fields when subset is selected', async () => {
      const res = await postLooker('/api/external/looker/get-data', {
        connectionConfig: {
          deploymentUrl: 'http://localhost',
          destinationId,
          destinationSecretKey,
        },
        request: {
          configParams: { destinationId, reportId },
          fields: [{ name: 'revenue' }],
        },
      });

      expect(res.status).toBe(200);
      expect(res.body.schema).toHaveLength(1);
      expect(res.body.schema[0].name).toBe('revenue');
      // Rows should contain only the revenue column values
      expect(res.body.rows[0].values).toEqual([42.5]);
    });
  });

  // -------------------------------------------------------------------------
  // Auth edge cases
  // -------------------------------------------------------------------------
  describe('Auth edge cases', () => {
    // LS-11
    // Flow: POST with Content-Type: application/json, body: { connectionConfig: {} }
    //   → express.json() parses body as object → typeof body === 'object'
    //   → GoogleJwtBody: typeof body !== 'string' → true
    //   → throw BadRequestException('Request body must contain JWT token')
    //   → 400
    it('returns 400 when body is not a JWT (plain JSON)', async () => {
      const res = await agent
        .post('/api/external/looker/get-config')
        .set('Content-Type', 'application/json')
        .send({ connectionConfig: {} });

      expect(res.status).toBe(400);
    });

    // LS-12
    // Flow: POST with Content-Type: application/jwt, body: 'invalid.jwt.token'
    //   → express.text() parses body as string → OK
    //   → GoogleJwtBody:
    //       jwt.decode('invalid.jwt.token') → null (malformed)
    //       header?.kid → undefined
    //       → throw UnauthorizedException('JWT header missing kid')
    //   → 401
    it('returns 401 for invalid JWT token', async () => {
      const res = await agent
        .post('/api/external/looker/get-config')
        .set('Content-Type', 'application/jwt')
        .send('invalid.jwt.token');

      expect(res.status).toBe(401);
    });
  });
});
