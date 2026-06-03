import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  StorageBuilder,
  DataMartBuilder,
  DataDestinationBuilder,
  ReportBuilder,
  AUTH_HEADER,
} from '@owox/test-utils';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { DataDestinationType } from '../src/data-marts/data-destination-types/enums/data-destination-type.enum';
import { DataMartDefinitionValidatorFacade } from '../src/data-marts/data-storage-types/facades/data-mart-definition-validator-facade.service';

// e2e for Athena output-controls SQL emission over the HTTP /generated-sql endpoint.
//
// The publish-time definition validator (which dry-runs the table against real
// Athena) is stubbed — that check is orthogonal to SQL generation and is the only
// reason a TABLE-defined mart would need live credentials. Everything that matters
// here runs for real: report → ReportSqlComposerService → AthenaQueryBuilder →
// AthenaClauseRenderer, with column types sourced from the persisted schema.
//
// Proves the endpoint serves CAST(? AS TIMESTAMP) for a date filter — a bare
// varchar placeholder would fail at execution because Trino won't compare a
// TIMESTAMP column to varchar.
describe('Output controls — Athena SQL emission (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let reportId: string;

  beforeAll(async () => {
    const testApp = await createTestApp([
      {
        provide: DataMartDefinitionValidatorFacade,
        useValue: { checkIsValid: async () => undefined },
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

    // TABLE definition → resolveTableName returns the FQN directly (no CreateView).
    const defRes = await agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({ definitionType: 'TABLE', definition: { fullyQualifiedName: 'testdb.events' } });
    expect(defRes.status).toBe(200);

    // Persist a schema with a TIMESTAMP column — this is what drives the cast.
    const schemaRes = await agent
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
    expect(schemaRes.status).toBe(200);

    const pubRes = await agent.put(`/api/data-marts/${dataMartId}/publish`).set(AUTH_HEADER);
    expect(pubRes.status).toBe(200);

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
    const dataDestinationId = destRes.body.id;
    await agent
      .put(`/api/data-destinations/${dataDestinationId}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForUse: true, availableForMaintenance: true });

    const reportRes = await agent
      .post('/api/reports')
      .set(AUTH_HEADER)
      .send(
        new ReportBuilder()
          .withDataMartId(dataMartId)
          .withDataDestinationId(dataDestinationId)
          .build()
      );
    expect(reportRes.status).toBe(201);
    reportId = reportRes.body.id;

    const putRes = await agent
      .put(`/api/reports/${reportId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'Athena date filter',
        dataDestinationId,
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 },
        columnConfig: ['id', 'created_at'],
        filterConfig: [{ column: 'created_at', operator: 'gte', value: '2024-01-01' }],
      });
    expect(putRes.status).toBe(200);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('GET /generated-sql wraps the date filter placeholder in CAST(? AS TIMESTAMP)', async () => {
    const res = await agent.get(`/api/reports/${reportId}/generated-sql`).set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.sql).toContain('"created_at" >= CAST(? AS TIMESTAMP)');
  });
});
