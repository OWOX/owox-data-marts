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

// HTTP-layer e2e for repointing a Data Mart at another input source type.
//
// The definition validator is stubbed: it dry-runs against a live warehouse, which is orthogonal
// to what is under test here and impossible in CI. Everything else — relationships, reports, the
// transition guard, persistence — runs for real against the test database.
const validatorStub = { checkIsValid: jest.fn().mockResolvedValue(undefined) };

describe('Data Mart input source change (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let storageId: string;

  const createDataMart = async (title: string): Promise<string> => {
    const res = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send(new DataMartBuilder().withStorageId(storageId).withTitle(title).build());
    expect(res.status).toBe(201);
    return res.body.id;
  };

  const setDefinition = (
    dataMartId: string,
    definitionType: string,
    definition: Record<string, unknown>
  ): supertest.Test =>
    agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({ definitionType, definition });

  beforeAll(async () => {
    const testApp = await createTestApp([
      { provide: DataMartDefinitionValidatorFacade, useValue: validatorStub },
    ]);
    app = testApp.app;
    agent = testApp.agent;

    const storageRes = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().withType(DataStorageType.GOOGLE_BIGQUERY).build());
    expect(storageRes.status).toBe(201);
    storageId = storageRes.body.id;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(() => {
    validatorStub.checkIsValid.mockClear();
    validatorStub.checkIsValid.mockResolvedValue(undefined);
  });

  it('keeps relationships and reports when the input source type changes', async () => {
    const subjectId = await createDataMart(`Subject ${Date.now()}`);
    const neighbourId = await createDataMart(`Neighbour ${Date.now()}`);

    expect(
      (await setDefinition(subjectId, 'TABLE', { fullyQualifiedName: 'proj.dataset.subject' }))
        .status
    ).toBe(200);
    expect(
      (await setDefinition(neighbourId, 'TABLE', { fullyQualifiedName: 'proj.dataset.neighbour' }))
        .status
    ).toBe(200);

    // Reports may only be created on a published Data Mart.
    expect((await agent.put(`/api/data-marts/${subjectId}/publish`).set(AUTH_HEADER)).status).toBe(
      200
    );

    // Outbound: subject -> neighbour. Inbound: neighbour -> subject.
    const outboundRes = await agent
      .post(`/api/data-marts/${subjectId}/relationships`)
      .set(AUTH_HEADER)
      .send({
        targetDataMartId: neighbourId,
        targetAlias: 'neighbour',
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
      });
    expect(outboundRes.status).toBe(201);

    // Two inbound relationships from the SAME source under different aliases: the unique key is
    // source + alias, so each row is its own dependency and must be counted separately.
    for (const alias of ['subject', 'subject_secondary']) {
      const inboundRes = await agent
        .post(`/api/data-marts/${neighbourId}/relationships`)
        .set(AUTH_HEADER)
        .send({
          targetDataMartId: subjectId,
          targetAlias: alias,
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
        });
      expect(inboundRes.status).toBe(201);
    }

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

    const reportRes = await agent
      .post('/api/reports')
      .set(AUTH_HEADER)
      .send(
        new ReportBuilder().withDataMartId(subjectId).withDataDestinationId(destRes.body.id).build()
      );
    expect(reportRes.status).toBe(201);
    const reportId = reportRes.body.id;

    // The transition that used to be rejected outright.
    const changed = await setDefinition(subjectId, 'SQL', { sqlQuery: 'SELECT 1 AS id' });
    expect(changed.status).toBe(200);
    expect(validatorStub.checkIsValid).toHaveBeenCalled();

    const dmRes = await agent.get(`/api/data-marts/${subjectId}`).set(AUTH_HEADER);
    expect(dmRes.body.definitionType).toBe('SQL');
    expect(dmRes.body.definition.sqlQuery).toBe('SELECT 1 AS id');
    // The Data Mart is still published after the change.
    expect(dmRes.body.status).toBe('PUBLISHED');

    // Both directions of the relationship survive.
    const outboundGraph = await agent
      .get(`/api/data-marts/${subjectId}/relationships/graph`)
      .set(AUTH_HEADER);
    expect(outboundGraph.body.nodes.length).toBeGreaterThan(0);
    const inboundGraph = await agent
      .get(`/api/data-marts/${neighbourId}/relationships/graph`)
      .set(AUTH_HEADER);
    expect(inboundGraph.body.nodes.length).toBeGreaterThan(0);

    // The report survives and still points at the same Data Mart.
    const reportAfter = await agent.get(`/api/reports/${reportId}`).set(AUTH_HEADER);
    expect(reportAfter.status).toBe(200);
    expect(reportAfter.body.dataMart.id).toBe(subjectId);

    // The impact endpoint reports the real counts, including the report. Inbound is 2 — one
    // source joining under two aliases is two dependencies, not one.
    const impact = await agent
      .get(`/api/data-marts/${subjectId}/input-source-change-impact`)
      .set(AUTH_HEADER);
    expect(impact.status).toBe(200);
    expect(impact.body).toEqual({
      outboundRelationshipsCount: 1,
      inboundRelationshipsCount: 2,
      reportsCount: 1,
    });
  });

  it('refuses a new input source the storage cannot resolve, persisting neither type nor definition', async () => {
    const dataMartId = await createDataMart(`Unresolvable ${Date.now()}`);
    expect(
      (await setDefinition(dataMartId, 'TABLE', { fullyQualifiedName: 'proj.dataset.orders' }))
        .status
    ).toBe(200);

    validatorStub.checkIsValid.mockRejectedValue(new Error('Table not found'));

    const changed = await setDefinition(dataMartId, 'SQL', { sqlQuery: 'SELECT nope FROM' });
    expect(changed.status).toBeGreaterThanOrEqual(400);

    const dmRes = await agent.get(`/api/data-marts/${dataMartId}`).set(AUTH_HEADER);
    expect(dmRes.body.definitionType).toBe('TABLE');
    expect(dmRes.body.definition.fullyQualifiedName).toBe('proj.dataset.orders');
  });

  it('rejects switching to or from a connector', async () => {
    const dataMartId = await createDataMart(`Connector ${Date.now()}`);
    expect(
      (
        await setDefinition(dataMartId, 'CONNECTOR', {
          connector: {
            source: {
              name: 'BankOfCanada',
              configuration: [{ ReimportLookbackWindow: 2 }],
              node: 'observations/group',
              fields: ['date', 'label', 'rate'],
            },
            storage: { fullyQualifiedName: 'test_dataset.rates' },
          },
        })
      ).status
    ).toBe(200);

    const changed = await setDefinition(dataMartId, 'TABLE', {
      fullyQualifiedName: 'proj.dataset.rates',
    });
    expect(changed.status).toBeGreaterThanOrEqual(400);

    const dmRes = await agent.get(`/api/data-marts/${dataMartId}`).set(AUTH_HEADER);
    expect(dmRes.body.definitionType).toBe('CONNECTOR');

    // And the other direction: a plain source cannot become a connector.
    const plainId = await createDataMart(`Plain ${Date.now()}`);
    expect(
      (await setDefinition(plainId, 'TABLE', { fullyQualifiedName: 'proj.dataset.plain' })).status
    ).toBe(200);
    const toConnector = await setDefinition(plainId, 'CONNECTOR', {
      connector: {
        source: {
          name: 'BankOfCanada',
          configuration: [{ ReimportLookbackWindow: 2 }],
          node: 'observations/group',
          fields: ['date'],
        },
        storage: { fullyQualifiedName: 'test_dataset.rates' },
      },
    });
    expect(toConnector.status).toBeGreaterThanOrEqual(400);
  });
});
