import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  AUTH_HEADER,
  StorageBuilder,
  DataMartBuilder,
} from '@owox/test-utils';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { DataMartDefinitionValidatorFacade } from '../src/data-marts/data-storage-types/facades/data-mart-definition-validator-facade.service';
import type { IdpProvider, Payload } from '@owox/idp-protocol';

// NullIdpProvider answers admin for any token; resolving by prefix is how the
// permissions suites drive a specific project role through the real IdpGuard.
const VIEWER_AUTH_HEADER = { 'x-owox-authorization': 'viewer-token' };
const EDITOR_AUTH_HEADER = { 'x-owox-authorization': 'editor-token' };

const ADMIN_PAYLOAD: Payload = {
  userId: '0',
  email: 'admin@localhost',
  roles: ['admin'],
  fullName: 'Admin',
  projectId: '0',
};
const EDITOR_PAYLOAD: Payload = { ...ADMIN_PAYLOAD, userId: '1', roles: ['editor'] };
const VIEWER_PAYLOAD: Payload = { ...ADMIN_PAYLOAD, userId: '2', roles: ['viewer'] };

function resolvePayload(token: string): Payload {
  if (token.startsWith('viewer')) return VIEWER_PAYLOAD;
  if (token.startsWith('editor')) return EDITOR_PAYLOAD;
  return ADMIN_PAYLOAD;
}

// The token parameter carries NO `attributes: ['SECRET']`. That is the shape a
// connector author writes by default, and the shape that used to leak: the whole
// secret pipeline keys off the SECRET attribute in the resolved specification, which
// for a custom connector comes from this user-authored JSON. It is kept unmarked
// here on purpose — the parser has to supply the attribute because the manifest
// interpolates Token into `authentication`.
const MANIFEST = {
  version: '1.0',
  name: 'MyCustomApi',
  baseUrl: 'https://api.example.com',
  authentication: {
    type: 'bearer',
    inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ parameters.Token }}' },
  },
  parameters: { Token: { requiredType: 'string', isRequired: true, label: 'API Token' } },
  nodes: {
    items: {
      fields: { id: { type: 'string' }, name: { type: 'string' } },
      uniqueKeys: ['id'],
      request: { method: 'GET', path: '/items' },
      recordSelector: { recordPath: [] },
    },
  },
};

// Dry-runs the definition against a live warehouse, which is orthogonal to the
// credential handling under test and impossible in CI.
const validatorStub = { checkIsValid: jest.fn().mockResolvedValue(undefined) };

describe('Custom Connector (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const testApp = await createTestApp([
      { provide: DataMartDefinitionValidatorFacade, useValue: validatorStub },
    ]);
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
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  /** Storage + Data Mart with no definition yet, ready for a PUT /definition. */
  const createDataMartForBinding = async (titlePrefix: string): Promise<string> => {
    const storageRes = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().withType(DataStorageType.GOOGLE_BIGQUERY).build());
    expect(storageRes.status).toBe(201);

    const martRes = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send(
        new DataMartBuilder()
          .withStorageId(storageRes.body.id)
          .withTitle(`${titlePrefix} ${Date.now()}`)
          .build()
      );
    expect(martRes.status).toBe(201);
    return martRes.body.id as string;
  };

  /** The CONNECTOR definition payload, parameterised only by the connector name. */
  const connectorDefinitionBody = (connectorName: string) => ({
    definitionType: 'CONNECTOR',
    definition: {
      connector: {
        source: {
          name: connectorName,
          configuration: [{ Token: 'irrelevant-to-this-test' }],
          node: 'items',
          fields: ['id', 'name'],
        },
        storage: { fullyQualifiedName: 'test_dataset.items' },
      },
    },
  });

  it('create → list → publish → spec/fields end to end', async () => {
    const created = await agent
      .post('/api/connectors/custom')
      .set(AUTH_HEADER)
      .send({ name: 'MyCustomApi', title: 'My Custom API', manifest: MANIFEST });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect(id).toBeTruthy();

    const list = await agent.get('/api/connectors/custom').set(AUTH_HEADER);
    expect(list.status).toBe(200);
    expect(list.body.some((c: { name: string }) => c.name === 'MyCustomApi')).toBe(true);

    const published = await agent.post(`/api/connectors/custom/${id}/publish`).set(AUTH_HEADER);
    expect(published.status).toBe(201);
    expect(published.body.status).toBe('published');

    const listAfterPublish = await agent.get('/api/connectors/custom').set(AUTH_HEADER);
    const item = listAfterPublish.body.find((c: { name: string }) => c.name === 'MyCustomApi');
    expect(item).toBeDefined();
    expect(item.activeVersion).toBe(1);

    const spec = await agent.get(`/api/connectors/custom/${id}/specification`).set(AUTH_HEADER);
    expect(spec.status).toBe(200);
    const tokenField = spec.body.find((p: { name: string }) => p.name === 'Token');
    expect(tokenField).toBeDefined();
    // The manifest never said SECRET; the parser supplied it because `authentication`
    // interpolates Token. This attribute is what the whole secret pipeline reads.
    expect(tokenField.attributes).toContain('SECRET');

    const fields = await agent.get(`/api/connectors/custom/${id}/fields`).set(AUTH_HEADER);
    expect(fields.status).toBe(200);
    const node = fields.body.find((n: { name: string }) => n.name === 'items');
    expect(node).toBeDefined();
    expect(node.fields.map((f: { name: string }) => f.name)).toEqual(
      expect.arrayContaining(['id', 'name'])
    );
  });

  it('never returns a custom connector token in plain text, even with no SECRET in the manifest', async () => {
    const PLAINTEXT_TOKEN = 'pk_live_e2e_should_never_be_readable';
    const connectorName = `TokenLeakApi${Date.now()}`;

    const created = await agent
      .post('/api/connectors/custom')
      .set(AUTH_HEADER)
      .send({
        name: connectorName,
        title: 'Token Leak API',
        manifest: { ...MANIFEST, name: connectorName },
      });
    expect(created.status).toBe(201);
    const publishRes = await agent
      .post(`/api/connectors/custom/${created.body.id}/publish`)
      .set(AUTH_HEADER);
    expect(publishRes.status).toBe(201);

    const storageRes = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().withType(DataStorageType.GOOGLE_BIGQUERY).build());
    expect(storageRes.status).toBe(201);

    const martRes = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send(
        new DataMartBuilder()
          .withStorageId(storageRes.body.id)
          .withTitle(`Token Leak ${Date.now()}`)
          .build()
      );
    expect(martRes.status).toBe(201);
    const dataMartId = martRes.body.id as string;

    const definitionRes = await agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({
        definitionType: 'CONNECTOR',
        definition: {
          connector: {
            source: {
              name: connectorName,
              configuration: [{ Token: PLAINTEXT_TOKEN }],
              node: 'items',
              fields: ['id', 'name'],
            },
            storage: { fullyQualifiedName: 'test_dataset.items' },
          },
        },
      });
    expect(definitionRes.status).toBe(200);

    // GET /data-marts/:id is @Auth(Role.viewer()) — every project viewer sees this
    // body, and it also feeds the search index and MCP telemetry.
    const readBack = await agent.get(`/api/data-marts/${dataMartId}`).set(AUTH_HEADER);
    expect(readBack.status).toBe(200);
    expect(JSON.stringify(readBack.body)).not.toContain(PLAINTEXT_TOKEN);

    const config = readBack.body.definition.connector.source.configuration[0];
    expect(config.Token).toBe('**********');
  });

  /**
   * A manifest is author-written JSON, and the builder accepts a pasted `curl`, so a
   * literal credential inside one is ordinary — not a misuse. GET :id/versions/:version
   * is the only endpoint that returns that JSON verbatim, and its sole consumer is the
   * builder, whose every write already requires editor. Nothing else in the set carries
   * the manifest, so the derived reads a viewer genuinely needs stay open.
   */
  it('serves the raw manifest to an editor but never to a viewer, leaving the derived reads open', async () => {
    const connectorName = `ViewerManifest${Date.now()}`;
    // Unique so it cannot appear in any other response by coincidence.
    const secretBaseUrl = `https://manifest-only-${Date.now()}.example.test`;

    const created = await agent
      .post('/api/connectors/custom')
      .set(AUTH_HEADER)
      .send({
        name: connectorName,
        title: 'Viewer Manifest Probe',
        manifest: { ...MANIFEST, name: connectorName, baseUrl: secretBaseUrl },
      });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect((await agent.post(`/api/connectors/custom/${id}/publish`).set(AUTH_HEADER)).status).toBe(
      201
    );

    const asViewer = await agent
      .get(`/api/connectors/custom/${id}/versions/1`)
      .set(VIEWER_AUTH_HEADER);
    expect(asViewer.status).toBe(403);
    expect(JSON.stringify(asViewer.body)).not.toContain(secretBaseUrl);

    // The builder still reads its own manifest — the endpoint is restricted, not removed.
    const asEditor = await agent
      .get(`/api/connectors/custom/${id}/versions/1`)
      .set(EDITOR_AUTH_HEADER);
    expect(asEditor.status).toBe(200);
    expect(asEditor.body.manifest.baseUrl).toBe(secretBaseUrl);

    // Everything a viewer legitimately needs to pick and configure a connector is
    // derived from the manifest, never the manifest itself. These must stay open.
    for (const path of [
      '/api/connectors/custom',
      `/api/connectors/custom/${id}`,
      `/api/connectors/custom/${id}/specification`,
      `/api/connectors/custom/${id}/fields`,
    ]) {
      const res = await agent.get(path).set(VIEWER_AUTH_HEADER);
      expect([path, res.status]).toEqual([path, 200]);
      expect(JSON.stringify(res.body)).not.toContain(secretBaseUrl);
    }
  });

  /**
   * The request that BINDS a custom connector to a Data Mart. Before it will accept the
   * definition, UpdateDataMartDefinitionService resolves the named connector's
   * capabilities; the bundled-only lookup (ConnectorService.getConnectorCapabilities)
   * throws NotFoundException for any name outside the build-time bundle, and a custom
   * connector's name can never be in that bundle. So every custom connector 404'd here and
   * the feature was unusable end to end. The use case calls resolveConnectorCapabilities,
   * which falls back to the stored manifest.
   *
   * Reverting UpdateDataMartDefinitionService.resolveConnectorCapabilities() to the
   * bundled-only call brings the 404 back and turns this red. `resolveConnectorCapabilities`
   * has no other end-to-end coverage: the identical PUT inside the token-leak test above is
   * a bystander assertion that a refactor toward that test's stated subject would remove.
   */
  it('binds a published custom connector to a Data Mart definition', async () => {
    const connectorName = `BindableApi${Date.now()}`;
    const created = await agent
      .post('/api/connectors/custom')
      .set(AUTH_HEADER)
      .send({
        name: connectorName,
        title: 'Bindable API',
        manifest: { ...MANIFEST, name: connectorName },
      });
    expect(created.status).toBe(201);
    const publishRes = await agent
      .post(`/api/connectors/custom/${created.body.id}/publish`)
      .set(AUTH_HEADER);
    expect(publishRes.status).toBe(201);

    const dataMartId = await createDataMartForBinding('Bindable');

    const definitionRes = await agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(AUTH_HEADER)
      .send(connectorDefinitionBody(connectorName));

    expect(definitionRes.status).toBe(200);

    // A 200 that stored nothing would be no better than the 404. Read it back.
    const readBack = await agent.get(`/api/data-marts/${dataMartId}`).set(AUTH_HEADER);
    expect(readBack.status).toBe(200);
    expect(readBack.body.definitionType).toBe('CONNECTOR');
    expect(readBack.body.definition.connector.source.name).toBe(connectorName);
    expect(readBack.body.definition.connector.source.node).toBe('items');
  });

  /**
   * The negative control for the test above. Resolving custom connectors must not have been
   * bought by dropping the existence check altogether: a name that is neither bundled nor
   * a published custom connector still has to 404, or the 200 above proves nothing.
   */
  it('still refuses a Data Mart definition naming a connector that does not exist', async () => {
    const dataMartId = await createDataMartForBinding('Unknown Connector');

    const definitionRes = await agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(AUTH_HEADER)
      .send(connectorDefinitionBody(`NeverPublishedApi${Date.now()}`));

    expect(definitionRes.status).toBe(404);
  });

  it('rejects a name that collides with a bundled connector', async () => {
    const res = await agent
      .post('/api/connectors/custom')
      .set(AUTH_HEADER)
      .send({ name: 'GitHub', title: 'x', manifest: MANIFEST });
    expect(res.status).toBe(400);
  });

  /**
   * body-parser.config.ts keeps the transport ceiling (2 MiB) deliberately above the endpoint's own
   * DTO limit so that an oversized manifest comes back as this endpoint's documented client error
   * rather than a raw middleware 413 from outside the application. This body is well past the
   * manifest ceiling and well under the transport one, so only the DTO can be what rejects it --
   * and a 413 here would mean the two limits had been ordered the wrong way round.
   */
  it('answers an oversized manifest with the documented 400, not a transport 413', async () => {
    const res = await agent
      .post('/api/connectors/custom')
      .set(AUTH_HEADER)
      .send({
        name: 'OversizedApi',
        title: 'Oversized',
        manifest: { ...MANIFEST, pad: 'x'.repeat(200 * 1024) },
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('manifest');
  });

  it('POST /connectors/custom/test rejects an invalid manifest', async () => {
    const res = await agent
      .post('/api/connectors/custom/test')
      .set(AUTH_HEADER)
      .send({ manifest: { name: 'X' }, node: 'missing', configuration: {} });
    expect(res.status).toBe(400);
  });

  it('rejects publishing an invalid manifest', async () => {
    const created = await agent
      .post('/api/connectors/custom')
      .set(AUTH_HEADER)
      .send({ name: 'BrokenApi', title: 'Broken', manifest: MANIFEST });
    const id = created.body.id as string;
    await agent
      .put(`/api/connectors/custom/${id}/draft`)
      .set(AUTH_HEADER)
      .send({ manifest: { bad: true } });
    const res = await agent.post(`/api/connectors/custom/${id}/publish`).set(AUTH_HEADER);
    expect(res.status).toBe(400);
  });
});
