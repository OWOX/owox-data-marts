import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  AUTH_HEADER,
  StorageBuilder,
  DataMartBuilder,
} from '@owox/test-utils';
import { IdpProjectionsFacade } from '../src/idp/facades/idp-projections.facade';
import { ProjectMemberDto } from '../src/idp/dto/domain/project-member.dto';
import type { IdpProvider, Payload } from '@owox/idp-protocol';

const EDITOR_AUTH_HEADER = { 'x-owox-authorization': 'editor-token' };

const ADMIN_PAYLOAD: Payload = {
  userId: '0',
  email: 'admin@localhost',
  roles: ['admin'],
  fullName: 'Admin',
  projectId: '0',
};
const EDITOR_PAYLOAD: Payload = {
  userId: '1',
  email: 'editor@localhost',
  roles: ['editor'],
  fullName: 'Technical User',
  projectId: '0',
};

function resolvePayload(token: string): Payload {
  return token.startsWith('editor') ? EDITOR_PAYLOAD : ADMIN_PAYLOAD;
}

const STRING_FIELD_SCHEMA = (name: string) => ({
  type: 'bigquery-data-mart-schema',
  fields: [{ name, type: 'STRING', mode: 'NULLABLE', status: 'CONNECTED' }],
});

/**
 * A new Data Mart is shared for maintenance by default, so another Technical User
 * can join it without the owner sharing it first.
 *
 * The default is deliberate: joining is gated by Edit access on both Data Marts,
 * and requiring the owner to flip a toggle first made the "add one more column"
 * flow undiscoverable. The owner can still switch maintenance sharing off.
 */
describe('Data Mart default sharing (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let storageId: string;
  let ownerDataMartId: string;
  let otherUserDataMartId: string;

  async function createDataMart(
    title: string,
    authHeader: Record<string, string>,
    schemaFieldName: string
  ): Promise<string> {
    const createRes = await agent
      .post('/api/data-marts')
      .set(authHeader)
      .send(new DataMartBuilder().withTitle(title).withStorageId(storageId).build());
    expect(createRes.status).toBe(201);
    const dataMartId: string = createRes.body.id;

    const defRes = await agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(authHeader)
      .send({ definitionType: 'SQL', definition: { sqlQuery: 'SELECT 1' } });
    expect(defRes.status).toBe(200);

    const publishRes = await agent.put(`/api/data-marts/${dataMartId}/publish`).set(authHeader);
    expect(publishRes.status).toBe(200);

    const schemaRes = await agent
      .put(`/api/data-marts/${dataMartId}/schema`)
      .set(authHeader)
      .send({ schema: STRING_FIELD_SCHEMA(schemaFieldName) });
    expect(schemaRes.status).toBe(200);

    return dataMartId;
  }

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    const expressApp = (
      app.getHttpAdapter() as { getInstance(): Express.Application }
    ).getInstance();
    const idpProvider = expressApp.get('idp') as IdpProvider;
    jest
      .spyOn(idpProvider, 'introspectToken')
      .mockImplementation(async token => resolvePayload(token));
    jest.spyOn(idpProvider, 'parseToken').mockImplementation(async token => resolvePayload(token));

    const facade = app.get(IdpProjectionsFacade);
    jest
      .spyOn(facade, 'getProjectMembers')
      .mockResolvedValue([
        new ProjectMemberDto('0', 'admin@localhost', 'Admin', undefined, 'admin', true, false),
        new ProjectMemberDto(
          '1',
          'editor@localhost',
          'Technical User',
          undefined,
          'editor',
          true,
          false
        ),
      ]);

    const storageRes = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().build());
    expect(storageRes.status).toBe(201);
    storageId = storageRes.body.id;

    // Neither Data Mart gets an explicit availability call — the defaults are under test.
    ownerDataMartId = await createDataMart('Owner Data Mart', AUTH_HEADER, 'id');
    otherUserDataMartId = await createDataMart(
      'Other User Data Mart',
      EDITOR_AUTH_HEADER,
      'ref_id'
    );
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('reports a new Data Mart as shared for reporting and for maintenance', async () => {
    const res = await agent.get(`/api/data-marts/${ownerDataMartId}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.availableForReporting).toBe(true);
    expect(res.body.availableForMaintenance).toBe(true);
  });

  it('lets a non-owner Technical User join a new Data Mart without the owner sharing it', async () => {
    const res = await agent
      .post(`/api/data-marts/${otherUserDataMartId}/relationships`)
      .set(EDITOR_AUTH_HEADER)
      .send({
        targetDataMartId: ownerDataMartId,
        targetAlias: 'owner_mart',
        joinConditions: [{ sourceFieldName: 'ref_id', targetFieldName: 'id' }],
      });

    expect(res.status).toBe(201);
  });

  it('blocks the join once the owner turns maintenance sharing off', async () => {
    const availabilityRes = await agent
      .put(`/api/data-marts/${ownerDataMartId}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForReporting: true, availableForMaintenance: false });
    expect(availabilityRes.status).toBe(204);

    const res = await agent
      .post(`/api/data-marts/${otherUserDataMartId}/relationships`)
      .set(EDITOR_AUTH_HEADER)
      .send({
        targetDataMartId: ownerDataMartId,
        targetAlias: 'owner_mart_again',
        joinConditions: [{ sourceFieldName: 'ref_id', targetFieldName: 'id' }],
      });

    expect(res.status).toBe(403);
  });
});
