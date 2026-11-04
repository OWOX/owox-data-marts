import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  StorageBuilder,
  DataMartBuilder,
  AUTH_HEADER,
} from '@owox/test-utils';
import type { IdpProvider, Payload } from '@owox/idp-protocol';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { DataMartDefinitionValidatorFacade } from '../src/data-marts/data-storage-types/facades/data-mart-definition-validator-facade.service';
import { IdpProjectionsFacade } from '../src/idp/facades/idp-projections.facade';
import { ProjectMemberDto } from '../src/idp/dto/domain/project-member.dto';

// GET /api/data-marts/by-connector/:connectorName feeds "Reuse from another Data Mart" with each
// configuration, so it lists only the Data Marts the member can open. The definition validator
// is stubbed: it dry-runs against a live warehouse, which is not what is under test.
const VIEWER_AUTH_HEADER = { 'x-owox-authorization': 'viewer-token' };
const EDITOR_AUTH_HEADER = { 'x-owox-authorization': 'editor-token' };

const PAYLOADS: Record<'admin' | 'editor' | 'viewer', Payload> = {
  admin: {
    userId: '0',
    email: 'admin@localhost',
    roles: ['admin'],
    fullName: 'Admin',
    projectId: '0',
  },
  editor: {
    userId: '1',
    email: 'editor@localhost',
    roles: ['editor'],
    fullName: 'Technical User',
    projectId: '0',
  },
  viewer: {
    userId: '2',
    email: 'viewer@localhost',
    roles: ['viewer'],
    fullName: 'Business User',
    projectId: '0',
  },
};

function resolvePayload(token: string): Payload {
  if (token.startsWith('viewer')) return PAYLOADS.viewer;
  if (token.startsWith('editor')) return PAYLOADS.editor;
  return PAYLOADS.admin;
}

describe('Data Marts by connector access (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataMartId: string;

  const listed = async (headers: Record<string, string>): Promise<string[]> => {
    const res = await agent.get('/api/data-marts/by-connector/BankOfCanada').set(headers);
    expect(res.status).toBe(200);
    return (res.body as { id: string }[]).map(item => item.id);
  };

  const share = (availableForReporting: boolean) =>
    agent
      .put(`/api/data-marts/${dataMartId}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForReporting, availableForMaintenance: false })
      .expect(204);

  beforeAll(async () => {
    const testApp = await createTestApp([
      {
        provide: DataMartDefinitionValidatorFacade,
        useValue: { checkIsValid: jest.fn().mockResolvedValue(undefined) },
      },
    ]);
    app = testApp.app;
    agent = testApp.agent;

    const expressApp = (
      app.getHttpAdapter() as { getInstance(): Express.Application }
    ).getInstance();
    const idpProvider = expressApp.get('idp') as IdpProvider;
    jest.spyOn(idpProvider, 'introspectToken').mockImplementation(async t => resolvePayload(t));
    jest.spyOn(idpProvider, 'parseToken').mockImplementation(async t => resolvePayload(t));
    jest
      .spyOn(app.get(IdpProjectionsFacade), 'getProjectMembers')
      .mockResolvedValue(
        Object.values(PAYLOADS).map(
          p =>
            new ProjectMemberDto(
              p.userId,
              p.email!,
              p.fullName!,
              undefined,
              p.roles![0],
              true,
              false
            )
        )
      );

    const storage = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().withType(DataStorageType.GOOGLE_BIGQUERY).build());
    expect(storage.status).toBe(201);
    const dataMart = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send(new DataMartBuilder().withStorageId(storage.body.id).withTitle('Rates').build());
    expect(dataMart.status).toBe(201);
    dataMartId = dataMart.body.id;
    const definition = await agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({
        definitionType: 'CONNECTOR',
        definition: {
          connector: {
            source: {
              name: 'BankOfCanada',
              configuration: [{ ReimportLookbackWindow: 2 }],
              node: 'observations/group',
              fields: ['date', 'label', 'rate'],
            },
            storage: { fullyQualifiedName: 'test_dataset.rates' },
          },
        },
      });
    expect(definition.status).toBe(200);
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('lists a Data Mart that is not shared only to the admin', async () => {
    await share(false);

    expect(await listed(AUTH_HEADER)).toContain(dataMartId);
    expect(await listed(EDITOR_AUTH_HEADER)).not.toContain(dataMartId);
    expect(await listed(VIEWER_AUTH_HEADER)).not.toContain(dataMartId);
  });

  it('lists a Data Mart shared for reporting to the members who can now open it', async () => {
    await share(true);

    expect(await listed(EDITOR_AUTH_HEADER)).toContain(dataMartId);
    expect(await listed(VIEWER_AUTH_HEADER)).toContain(dataMartId);
  });
});
