import { INestApplication } from '@nestjs/common';
import * as crypto from 'crypto';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  StorageBuilder,
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
import { ReportDataHeader } from '../src/data-marts/dto/domain/report-data-header.dto';
import { ReportDataBatch } from '../src/data-marts/dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../src/data-marts/dto/domain/report-data-description.dto';
import { AthenaFieldType } from '../src/data-marts/data-storage-types/athena/enums/athena-field-type.enum';

// HTTP-layer e2e for Athena output-controls SQL emission. ONE app + ONE Athena
// report (date filter on a TIMESTAMP column) drives two assertions to keep the
// e2e suite fast — booting createTestApp() is the dominant cost:
//
//   1. GET /generated-sql emits CAST(? AS TIMESTAMP) — the date-literal-typing fix.
//   2. POST /looker/get-data runs the REAL ReportDataCacheService (only the storage
//      reader is a spy), proving resolvePrepareOptions() composes + forwards bound
//      params instead of dropping output controls / emitting unbound placeholders.
//
// The publish-time validator is stubbed (orthogonal — it dry-runs live Athena);
// everything else (composer → builder → renderer, types from the persisted schema)
// runs for real.

const HEADERS: ReportDataHeader[] = [
  new ReportDataHeader('id', 'id', undefined, AthenaFieldType.INTEGER),
  new ReportDataHeader('created_at', 'created_at', undefined, AthenaFieldType.TIMESTAMP),
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
  getType: jest.fn().mockReturnValue(DataStorageType.AWS_ATHENA),
};

const mockSchemaProviderFacade = {
  getActualDataMartSchema: jest.fn().mockResolvedValue({
    type: 'athena-data-mart-schema',
    fields: HEADERS.map(h => ({
      name: h.name,
      type: h.type,
      status: 'CONNECTED',
      isPrimaryKey: false,
    })),
  }),
};

describe('Output controls — Athena SQL emission (e2e)', () => {
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
    ]);
    app = testApp.app;
    agent = testApp.agent;

    const storageRes = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().withType(DataStorageType.AWS_ATHENA).build());
    expect(storageRes.status).toBe(201);
    const storageId = storageRes.body.id;

    const dmRes = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send(new DataMartBuilder().withStorageId(storageId).build());
    expect(dmRes.status).toBe(201);
    const dataMartId = dmRes.body.id;

    await agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({ definitionType: 'TABLE', definition: { fullyQualifiedName: 'testdb.events' } });

    await agent
      .put(`/api/data-marts/${dataMartId}/schema`)
      .set(AUTH_HEADER)
      .send({
        schema: {
          type: 'athena-data-mart-schema',
          fields: [
            { name: 'id', type: 'INTEGER', status: 'CONNECTED', isPrimaryKey: false },
            { name: 'created_at', type: 'TIMESTAMP', status: 'CONNECTED', isPrimaryKey: false },
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

    // The Looker report lookup INNER JOINs storage.credential — seed one and a config.
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
      [
        credentialId,
        '0',
        'aws_athena_credentials',
        JSON.stringify({ accessKeyId: 'test-key', secretAccessKey: 'test-secret' }),
      ]
    );
    await dataSource.query(`UPDATE data_storage SET config = ?, credentialId = ? WHERE id = ?`, [
      JSON.stringify({ region: 'us-east-1', outputBucket: 'test-bucket' }),
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
        title: 'Looker Athena date filter',
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

  it('GET /generated-sql emits static SQL with the date value inlined into the CAST', async () => {
    const res = await agent.get(`/api/reports/${reportId}/generated-sql`).set(AUTH_HEADER);
    expect(res.status).toBe(200);
    // composeStatic() inlines Athena's positional params, so the preview is runnable
    // SQL (no unbound `?`) and the date literal stays valid inside the CAST.
    expect(res.body.sql).toContain(`"created_at" >= CAST('2024-01-01' AS TIMESTAMP)`);
    expect(res.body.sql).not.toContain('?');
  });

  it('carries composed output-controls SQL + bound params into the cached reader', async () => {
    const res = await postLooker('/api/external/looker/get-data', {
      connectionConfig: { deploymentUrl: 'http://localhost', destinationId, destinationSecretKey },
      request: {
        configParams: { destinationId, reportId },
        // Sample extraction still resolves the cached reader (our assertion target)
        // but skips creating a report run + its async success handlers — faster, no noise.
        scriptParams: { sampleExtraction: true },
        fields: [{ name: 'id' }, { name: 'created_at' }],
      },
    });

    expect(res.status).toBe(200);
    expect(spyReader.prepareReportData).toHaveBeenCalled();
    const options = spyReader.prepareReportData.mock.calls[0][1];
    expect(options.sqlOverride).toContain('"created_at" >= CAST(? AS TIMESTAMP)');
    expect(options.sqlOverrideParams).toEqual([{ name: 'p0', value: '2024-01-01' }]);
  });
});
