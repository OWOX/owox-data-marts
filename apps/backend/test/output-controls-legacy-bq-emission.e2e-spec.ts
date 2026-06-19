import { INestApplication } from '@nestjs/common';
import * as crypto from 'crypto';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  DataMartBuilder,
  DataDestinationBuilder,
  ReportBuilder,
  AUTH_HEADER,
  signLookerPayload,
  mockGoogleJwkFetch,
  restoreGoogleJwkFetch,
} from '@owox/test-utils';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { DataDestinationType } from '../src/data-marts/data-destination-types/enums/data-destination-type.enum';
import { DataMartDefinitionValidatorFacade } from '../src/data-marts/data-storage-types/facades/data-mart-definition-validator-facade.service';
import { DataMartSchemaProviderFacade } from '../src/data-marts/data-storage-types/facades/data-mart-schema-provider.facade';
import { DATA_STORAGE_REPORT_READER_RESOLVER } from '../src/data-marts/data-storage-types/data-storage-providers';
import { DataMartTableReferenceService } from '../src/data-marts/services/data-mart-table-reference.service';
import { LegacyDataMartsService } from '../src/data-marts/services/legacy-data-marts/legacy-data-marts.service';
import { ReportDataHeader } from '../src/data-marts/dto/domain/report-data-header.dto';
import { ReportDataBatch } from '../src/data-marts/dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../src/data-marts/dto/domain/report-data-description.dto';
import { BigQueryFieldType } from '../src/data-marts/data-storage-types/bigquery/enums/bigquery-field-type.enum';

// HTTP-layer e2e for Legacy BigQuery output-controls SQL emission. ONE app +
// ONE Legacy BigQuery report (date filter on a TIMESTAMP column) drives two
// assertions to keep the e2e suite fast — booting createTestApp() is the
// dominant cost:
//
//   1. GET /generated-sql inlines the date literal into a BigQuery CAST.
//   2. POST /looker/get-data runs the REAL ReportDataCacheService (only the
//      storage reader is a spy), proving resolvePrepareOptions() composes +
//      forwards bound params instead of dropping output controls.
//
// The publish-time validator, LegacyDataMartsService, and
// DataMartTableReferenceService are stubbed (all require live BigQuery/ODM
// service); everything else (composer → builder → renderer, types from the
// persisted schema) runs for real.
//
// LEGACY_GOOGLE_BIGQUERY storage cannot be created via the POST /api/data-storages
// endpoint (CreateDataStorageService rejects it), so we seed it directly via SQL.

const HEADERS: ReportDataHeader[] = [
  new ReportDataHeader('id', 'id', undefined, BigQueryFieldType.INTEGER),
  new ReportDataHeader('created_at', 'created_at', undefined, BigQueryFieldType.TIMESTAMP),
];

// Real ReportDataCacheService → spyReader.prepareReportData(report, options).
// We assert the options it captured.
const spyReader = {
  prepareReportData: jest.fn().mockResolvedValue(new ReportDataDescription(HEADERS, 1)),
  readReportDataBatch: jest
    .fn()
    .mockResolvedValue(new ReportDataBatch([['1', '2024-02-01']], null)),
  finalize: jest.fn().mockResolvedValue(undefined),
  getState: jest.fn().mockReturnValue(null),
  initFromState: jest.fn().mockResolvedValue(undefined),
  getType: jest.fn().mockReturnValue(DataStorageType.LEGACY_GOOGLE_BIGQUERY),
};

const mockSchemaProviderFacade = {
  getActualDataMartSchema: jest.fn().mockResolvedValue({
    type: 'bigquery-data-mart-schema',
    fields: HEADERS.map(h => ({
      name: h.name,
      type: h.storageFieldType,
      mode: 'NULLABLE',
      status: 'CONNECTED',
      isPrimaryKey: false,
    })),
  }),
};

describe('Output controls — Legacy BigQuery SQL emission (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let destinationId: string;
  let destinationSecretKey: string;
  let reportId: string;

  const postLooker = (path: string, payload: unknown): supertest.Test =>
    agent.post(path).set('Content-Type', 'application/jwt').send(signLookerPayload(payload));

  beforeAll(async () => {
    mockGoogleJwkFetch();

    const testApp = await createTestApp([
      {
        provide: DataMartDefinitionValidatorFacade,
        useValue: { checkIsValid: async () => undefined },
      },
      { provide: DataMartSchemaProviderFacade, useValue: mockSchemaProviderFacade },
      {
        provide: DATA_STORAGE_REPORT_READER_RESOLVER,
        useValue: { resolve: async () => spyReader },
      },
      {
        provide: DataMartTableReferenceService,
        useValue: {
          resolveTableName: async () => '`test-project`.`ds`.`view_legacy`',
          ensureSqlViewIsUpToDate: async () => '`test-project`.`ds`.`view_legacy`',
        },
      },
      {
        provide: LegacyDataMartsService,
        useValue: {
          createDataMart: jest.fn().mockResolvedValue({ id: crypto.randomUUID() }),
          updateQuery: jest.fn().mockResolvedValue(undefined),
          updateTitle: jest.fn().mockResolvedValue(undefined),
          updateDescription: jest.fn().mockResolvedValue(undefined),
          deleteDataMart: jest.fn().mockResolvedValue(undefined),
          parseQuery: jest.fn().mockImplementation((q: string) => Promise.resolve(q)),
          isDataMartIdLooksLikeLegacy: jest.fn().mockReturnValue(false),
        },
      },
    ]);
    app = testApp.app;
    agent = testApp.agent;

    // LEGACY_GOOGLE_BIGQUERY storage cannot be created via POST /api/data-storages.
    // Seed it directly in SQLite, mirroring the data_storage table columns.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const backendRoot = require.resolve('@owox/backend/package.json');
    const backendDir = require('path').dirname(backendRoot);
    const { DataSource } = require(require.resolve('typeorm', { paths: [backendDir] }));
    /* eslint-enable @typescript-eslint/no-require-imports */
    const dataSource = app.get(DataSource);
    const storageId = crypto.randomUUID();
    await dataSource.query(
      `INSERT INTO data_storage
         (id, type, projectId, title, config, credentialId, availableForUse, availableForMaintenance, createdById, createdAt, modifiedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        storageId,
        DataStorageType.LEGACY_GOOGLE_BIGQUERY,
        '0',
        'Legacy BQ Test Storage',
        JSON.stringify({ projectId: 'test-project' }),
        null,
        1,
        0,
        '0',
      ]
    );

    const dmRes = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send(new DataMartBuilder().withStorageId(storageId).build());
    expect(dmRes.status).toBe(201);
    const dataMartId = dmRes.body.id;

    await agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({
        definitionType: 'SQL',
        definition: { sqlQuery: 'SELECT id, created_at FROM events' },
      });

    await agent
      .put(`/api/data-marts/${dataMartId}/schema`)
      .set(AUTH_HEADER)
      .send({
        schema: {
          type: 'bigquery-data-mart-schema',
          fields: [
            {
              name: 'id',
              type: 'INTEGER',
              mode: 'NULLABLE',
              status: 'CONNECTED',
              isPrimaryKey: false,
            },
            {
              name: 'created_at',
              type: 'TIMESTAMP',
              mode: 'NULLABLE',
              status: 'CONNECTED',
              isPrimaryKey: false,
            },
          ],
        },
      });

    expect((await agent.put(`/api/data-marts/${dataMartId}/publish`).set(AUTH_HEADER)).status).toBe(
      200
    );
    await agent
      .put(`/api/data-storages/${storageId}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForUse: true, availableForMaintenance: true });
    await agent
      .put(`/api/data-marts/${dataMartId}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForReporting: true, availableForMaintenance: true });

    const destRes = await agent
      .post('/api/data-destinations')
      .set(AUTH_HEADER)
      .send(
        new DataDestinationBuilder()
          .withType(DataDestinationType.LOOKER_STUDIO)
          .withCredentials({ type: 'looker-studio-credentials' })
          .build()
      );
    expect(destRes.status).toBe(201);
    destinationId = destRes.body.id;
    await agent
      .put(`/api/data-destinations/${destinationId}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForUse: true, availableForMaintenance: true });

    // The Looker report lookup INNER JOINs storage.credential — seed one and link it.
    const credentialId = crypto.randomUUID();
    await dataSource.query(
      `INSERT INTO data_storage_credentials (id, projectId, type, credentials, createdAt, modifiedAt)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        credentialId,
        '0',
        'google_service_account',
        JSON.stringify({
          type: 'service_account',
          project_id: 'test-project',
          private_key_id: 'key-id',
          private_key:
            '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\n-----END PRIVATE KEY-----\n',
          client_email: 'test@test-project.iam.gserviceaccount.com',
          client_id: '123456789',
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
          auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
          client_x509_cert_url:
            'https://www.googleapis.com/robot/v1/metadata/x509/test%40test-project.iam.gserviceaccount.com',
        }),
      ]
    );
    await dataSource.query(`UPDATE data_storage SET config = ?, credentialId = ? WHERE id = ?`, [
      JSON.stringify({ projectId: 'test-project' }),
      credentialId,
      storageId,
    ]);

    destinationSecretKey = (
      await agent.get(`/api/data-destinations/${destinationId}`).set(AUTH_HEADER)
    ).body.credentials.destinationSecretKey;

    const reportRes = await agent
      .post('/api/reports')
      .set(AUTH_HEADER)
      .send(
        new ReportBuilder().withDataMartId(dataMartId).withDataDestinationId(destinationId).build()
      );
    expect(reportRes.status).toBe(201);
    reportId = reportRes.body.id;

    const putRes = await agent
      .put(`/api/reports/${reportId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'Looker Legacy BigQuery date filter',
        dataDestinationId: destinationId,
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        columnConfig: ['id', 'created_at'],
        filterConfig: [{ column: 'created_at', operator: 'gte', value: '2024-01-01' }],
      });
    expect(putRes.status).toBe(200);
  }, 120_000);

  afterAll(async () => {
    restoreGoogleJwkFetch();
    await closeTestApp(app);
  });

  it('GET /generated-sql inlines the date literal into CAST (BigQuery)', async () => {
    const res = await agent.get(`/api/reports/${reportId}/generated-sql`).set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.sql).toContain('`test-project`.`ds`.`view_legacy`');
    expect(res.body.sql).toContain("`created_at` >= CAST('2024-01-01' AS TIMESTAMP)");
    expect(res.body.sql).not.toContain('@p');
  });

  it('carries composed output-controls SQL + bound params into the cached reader', async () => {
    const res = await postLooker('/api/external/looker/get-data', {
      connectionConfig: { deploymentUrl: 'http://localhost', destinationId, destinationSecretKey },
      request: {
        configParams: { destinationId, reportId },
        scriptParams: { sampleExtraction: true },
        fields: [{ name: 'id' }, { name: 'created_at' }],
      },
    });
    expect(res.status).toBe(200);
    expect(spyReader.prepareReportData).toHaveBeenCalled();
    const options = spyReader.prepareReportData.mock.calls[0][1];
    expect(options.sqlOverride).toContain('`created_at` >= CAST(@p0 AS TIMESTAMP)');
    expect(options.sqlOverrideParams).toEqual([{ name: 'p0', value: '2024-01-01' }]);
  });
});
