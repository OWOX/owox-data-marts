import { INestApplication } from '@nestjs/common';
import { join } from 'path';
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
import { CredentialService } from '../src/data-marts/credentials/services/credential.service';
import {
  ConnectorTestService,
  type ConnectorTestRequest,
} from '../src/data-marts/services/connector/connector-test.service';
import { createCredential } from './fixtures/storage-credentials';

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

/** The real test service on the fake runner, which echoes every parameter and rotates a token. */
class EchoingConnectorTestService extends ConnectorTestService {
  protected runnerPath(): string {
    return join(__dirname, 'fixtures/fake-test-runner.mjs');
  }

  async runTest(args: ConnectorTestRequest) {
    return super.runTest(args, { env: { FAKE_KEY_ECHO: '1' } });
  }
}

// Basic auth: the username is a key parameter the manifest does not mark SECRET.
const BASIC_MANIFEST = {
  ...MANIFEST,
  name: 'BasicApi',
  baseUrl: 'https://basic.example.com',
  authentication: {
    type: 'basic',
    username: '{{ parameters.Username }}',
    password: '{{ parameters.Password }}',
  },
  parameters: {
    Username: { requiredType: 'string', isRequired: true, label: 'Username' },
    Password: { requiredType: 'string', isRequired: true, label: 'Password' },
  },
};
// Selective auth whose selection is untyped: the engine runs the default branch.
const SELECTIVE_MANIFEST = {
  ...BASIC_MANIFEST,
  authentication: {
    type: 'selective',
    selectionParameter: 'AuthMode',
    authenticators: { basic: BASIC_MANIFEST.authentication, bearer: MANIFEST.authentication },
  },
  parameters: {
    ...BASIC_MANIFEST.parameters,
    ...MANIFEST.parameters,
    AuthMode: { requiredType: 'string', default: 'basic' },
  },
};
const USERNAME = 'reporting-user-42';
const PASSWORD = 'pa55word-from-credential';

describe('Custom Connector (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const testApp = await createTestApp([
      { provide: DataMartDefinitionValidatorFacade, useValue: validatorStub },
      { provide: ConnectorTestService, useValue: new EchoingConnectorTestService() },
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

  /** A custom connector Credential that fits MANIFEST, as a converted key would be. */
  const fittingCredential = (token = 'irrelevant-to-this-test'): Promise<string> =>
    createCredential(app, {
      projectId: ADMIN_PAYLOAD.projectId,
      definitionId: 'custom-connector',
      title: `API Token ${Date.now()}`,
      secret: { fields: { Token: token } },
      publicMetadata: {
        hosts: ['api.example.com'],
        fieldList: [{ key: 'Token', label: 'API Token', secret: true }],
        fields: {},
      },
      ownerIds: [],
      contextIds: [],
    });

  /** A Credential holding BASIC_MANIFEST's keys: a public username and a secret password. */
  const basicCredential = (
    overrides: { host?: string; ownerIds?: string[] } = {}
  ): Promise<string> =>
    createCredential(app, {
      projectId: ADMIN_PAYLOAD.projectId,
      definitionId: 'custom-connector',
      title: `Basic ${Date.now()}`,
      secret: { fields: { Password: PASSWORD } },
      publicMetadata: {
        hosts: [overrides.host ?? 'basic.example.com'],
        fieldList: [
          { key: 'Username', label: 'Username', secret: false },
          { key: 'Password', label: 'Password', secret: true },
        ],
        fields: { Username: USERNAME },
      },
      ownerIds: overrides.ownerIds ?? [],
      contextIds: [],
    });

  const testWithCredential = (
    credentialId: string,
    body: { manifest?: Record<string, unknown>; configuration?: Record<string, unknown> } = {},
    auth = AUTH_HEADER
  ) =>
    agent
      .post('/api/connectors/custom/test')
      .set(auth)
      .send({
        manifest: body.manifest ?? BASIC_MANIFEST,
        node: 'items',
        configuration: body.configuration ?? {},
        credentialId,
      });

  /** The CONNECTOR definition payload whose one configuration selects `credentialId`. */
  const connectorDefinitionBody = (connectorName: string, credentialId: string) => ({
    definitionType: 'CONNECTOR',
    definition: {
      connector: {
        source: {
          name: connectorName,
          configuration: [{ _credential_id: credentialId }],
          node: 'items',
          fields: ['id', 'name'],
        },
        storage: { fullyQualifiedName: 'test_dataset.items' },
      },
    },
  });

  it('enforces Unicode column limits through HTTP and preserves a valid title on publish', async () => {
    const name = 'UnicodeTitleApi';
    const title = '😀'.repeat(255);
    const manifest = { ...MANIFEST, name, title };
    const invalid = await agent
      .post('/api/connectors/custom')
      .set(AUTH_HEADER)
      .send({ name, title: '☕️'.repeat(128), manifest });
    expect(invalid.status).toBe(400);
    const created = await agent
      .post('/api/connectors/custom')
      .set(AUTH_HEADER)
      .send({ name, title, manifest });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const patch = await agent
      .patch(`/api/connectors/custom/${id}`)
      .set(AUTH_HEADER)
      .send({ docUrl: '☕️'.repeat(128) });
    expect(patch.status).toBe(400);
    const published = await agent.post(`/api/connectors/custom/${id}/publish`).set(AUTH_HEADER);
    expect(published.status).toBe(201);
    const detail = await agent.get(`/api/connectors/custom/${id}`).set(AUTH_HEADER);
    expect(detail.body.title).toBe(title);
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

    // A typed token is refused: a configuration takes its key from a Credential.
    const typedRes = await agent
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
    expect(typedRes.status).toBe(400);
    expect(typedRes.body.message).toBe('This page is out of date. Reload it.');
    expect(JSON.stringify(typedRes.body)).not.toContain(PLAINTEXT_TOKEN);

    const credentialId = await fittingCredential(PLAINTEXT_TOKEN);
    const definitionRes = await agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(AUTH_HEADER)
      .send(connectorDefinitionBody(connectorName, credentialId));
    expect(definitionRes.status).toBe(200);
    expect(JSON.stringify(definitionRes.body)).not.toContain(PLAINTEXT_TOKEN);

    // GET /data-marts/:id is @Auth(Role.viewer()) — every project viewer sees this
    // body, and it also feeds the search index and MCP telemetry.
    const readBack = await agent.get(`/api/data-marts/${dataMartId}`).set(AUTH_HEADER);
    expect(readBack.status).toBe(200);
    expect(JSON.stringify(readBack.body)).not.toContain(PLAINTEXT_TOKEN);

    const config = readBack.body.definition.connector.source.configuration[0];
    expect(config._credential_id).toBe(credentialId);
    expect(config).not.toHaveProperty('Token');
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
      .send(connectorDefinitionBody(connectorName, await fittingCredential()));

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
      .send(connectorDefinitionBody(`NeverPublishedApi${Date.now()}`, 'unused'));

    expect(definitionRes.status).toBe(404);
  });

  it('refuses to clear the title of a connector, which the title column cannot hold', async () => {
    const connectorName = `TitledApi${Date.now()}`;
    const created = await agent
      .post('/api/connectors/custom')
      .set(AUTH_HEADER)
      .send({
        name: connectorName,
        title: 'Titled API',
        manifest: { ...MANIFEST, name: connectorName },
      });
    expect(created.status).toBe(201);

    const res = await agent
      .patch(`/api/connectors/custom/${created.body.id}`)
      .set(AUTH_HEADER)
      .send({ title: null });

    expect(res.status).toBe(400);
  });

  /**
   * A Data Mart that pins no version runs the active one with its own credentials, so
   * publishing or activating decides where they go: an editor needs edit access to every
   * such Data Mart, and an admin has it.
   */
  it('lets an editor publish or activate only with edit access to the Data Marts that follow the active version', async () => {
    const connectorName = `FollowedApi${Date.now()}`;
    const manifest = { ...MANIFEST, name: connectorName };
    const created = await agent
      .post('/api/connectors/custom')
      .set(AUTH_HEADER)
      .send({ name: connectorName, title: 'Followed API', manifest });
    expect(created.status).toBe(201);
    const base = `/api/connectors/custom/${created.body.id}`;
    expect((await agent.post(`${base}/publish`).set(AUTH_HEADER)).status).toBe(201);

    const dataMartId = await createDataMartForBinding('Followed');
    const bound = await agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(AUTH_HEADER)
      .send(connectorDefinitionBody(connectorName, await fittingCredential()));
    expect(bound.status).toBe(200);

    const saveDraft = (baseUrl: string) =>
      agent
        .put(`${base}/draft`)
        .set(EDITOR_AUTH_HEADER)
        .send({ manifest: { ...manifest, baseUrl } });

    // A new Data Mart is shared for maintenance, which is edit access for the editor.
    expect((await saveDraft('https://api.example.org')).status).toBe(200);
    expect((await agent.post(`${base}/publish`).set(EDITOR_AUTH_HEADER)).status).toBe(201);

    const unshared = await agent
      .put(`/api/data-marts/${dataMartId}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForReporting: true, availableForMaintenance: false });
    expect(unshared.status).toBe(204);

    expect((await saveDraft('https://api.example.net')).status).toBe(200);
    const publishRes = await agent.post(`${base}/publish`).set(EDITOR_AUTH_HEADER);
    expect(publishRes.status).toBe(403);
    expect(publishRes.body.message).toContain('Data Marts you cannot edit');
    const activateRes = await agent.post(`${base}/versions/1/activate`).set(EDITOR_AUTH_HEADER);
    expect(activateRes.status).toBe(403);

    expect((await agent.post(`${base}/publish`).set(AUTH_HEADER)).status).toBe(201);
  });

  it("refuses a version change the kept Credential does not fit, as the Data Mart page's version control sends it", async () => {
    const connectorName = `PinnedApi${Date.now()}`;
    const manifest = { ...MANIFEST, name: connectorName };
    const created = await agent
      .post('/api/connectors/custom')
      .set(AUTH_HEADER)
      .send({ name: connectorName, title: 'Pinned API', manifest });
    expect(created.status).toBe(201);
    const base = `/api/connectors/custom/${created.body.id}`;
    expect((await agent.post(`${base}/publish`).set(AUTH_HEADER)).status).toBe(201);
    const otherHost = { manifest: { ...manifest, baseUrl: 'https://api.example.org' } };
    expect((await agent.put(`${base}/draft`).set(AUTH_HEADER).send(otherHost)).status).toBe(200);
    expect((await agent.post(`${base}/publish`).set(AUTH_HEADER)).status).toBe(201);

    const dataMartId = await createDataMartForBinding('Pinned');
    const body = connectorDefinitionBody(connectorName, await fittingCredential());
    const source = { ...body.definition.connector.source, version: 1 };
    const pinned = await agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({ ...body, definition: { connector: { ...body.definition.connector, source } } });
    expect(pinned.status).toBe(200);

    // The page sends back the definition it read, `_credential_id` included, with the new version.
    const { definition } = (await agent.get(`/api/data-marts/${dataMartId}`).set(AUTH_HEADER)).body;
    const withVersion = (version: number) => ({
      definitionType: 'CONNECTOR',
      definition: {
        ...definition,
        connector: {
          ...definition.connector,
          source: { ...definition.connector.source, version },
        },
      },
    });
    const put = (version: number) =>
      agent
        .put(`/api/data-marts/${dataMartId}/definition`)
        .set(AUTH_HEADER)
        .send(withVersion(version));

    const moved = await put(2);
    expect(moved.status).toBe(400);
    expect(moved.body.message).toBe(
      "This Data Mart's Credential no longer fits its connector. Select a fitting Credential."
    );
    expect((await put(1)).status).toBe(200);
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

  it('POST /connectors/custom/test rejects a node the manifest does not have', async () => {
    const res = await agent
      .post('/api/connectors/custom/test')
      .set(AUTH_HEADER)
      .send({ manifest: { name: 'X' }, node: 'missing', configuration: {} });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('Unknown node');
  });

  it('POST /connectors/custom/test rejects a node the parser refuses', async () => {
    const items = { ...MANIFEST.nodes.items, recordSelector: { recordPath: 'data.items' } };
    const res = await agent
      .post('/api/connectors/custom/test')
      .set(AUTH_HEADER)
      .send({ manifest: { ...MANIFEST, nodes: { items } }, node: 'items', configuration: {} });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('Invalid manifest');
    expect(JSON.stringify(res.body)).toContain('recordPath');
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
    expect(JSON.stringify(res.body)).toContain('Invalid manifest');
  });

  describe('POST /connectors/custom/test with a Credential', () => {
    const forms = (value: string) => [
      value,
      encodeURIComponent(value),
      JSON.stringify(value).slice(1, -1),
    ];

    it('runs with the Credential values merged server-side and OW_KEY_PARAMETERS set', async () => {
      const res = await testWithCredential(await basicCredential());

      expect(res.status).toBe(201);
      expect(res.body.logs).toContain('keys=["Username","Password"]');
      // Masked only because the runner received exactly the Credential's values.
      expect(res.body.rows[0]).toMatchObject({ Username: '***', Password: '***' });
    });

    it('rows and logs never contain a Credential value', async () => {
      const res = await testWithCredential(await basicCredential());

      expect(res.status).toBe(201);
      const body = JSON.stringify(res.body);
      for (const value of [USERNAME, PASSWORD, 'rotated-token-from-provider']) {
        for (const form of forms(value)) expect(body).not.toContain(form);
      }
      expect(res.body.sample[0]).toMatchObject({ Username: '***', Password: '***' });
    });

    it('drops the rotated-token line from logs and writes the token into the Credential', async () => {
      const credentialId = await basicCredential();

      const res = await testWithCredential(credentialId);

      expect(res.status).toBe(201);
      expect(JSON.stringify(res.body.logs)).not.toContain('CREDENTIALS');
      const stored = await app.get(CredentialService).findById(credentialId);
      expect(stored?.secret).toEqual({
        fields: { Password: PASSWORD, generated_refresh_token: 'rotated-token-from-provider' },
      });
    });

    it('refuses a Credential the caller cannot USE', async () => {
      const res = await testWithCredential(await basicCredential(), {}, EDITOR_AUTH_HEADER);

      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
    });

    it('refuses a Credential that does not fit the manifest', async () => {
      const res = await testWithCredential(await basicCredential({ host: 'other.example.com' }));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('This Credential cannot be used with this connector.');
    });

    it("fits a selective manifest on its selection's default when the test leaves it untyped", async () => {
      const res = await testWithCredential(await basicCredential(), {
        manifest: SELECTIVE_MANIFEST,
      });

      expect(res.status).toBe(201);
      expect(res.body.rows[0]).toMatchObject({ Username: '***', Password: '***' });
    });

    it('refuses key parameters in configuration when credentialId is set', async () => {
      const res = await testWithCredential(await basicCredential(), {
        configuration: { Password: 'typed-password' },
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Password');
      expect(JSON.stringify(res.body)).not.toContain('typed-password');
    });

    it('a manifest that misuses a key parameter fails naming the node and position', async () => {
      const items = {
        ...BASIC_MANIFEST.nodes.items,
        transformations: [{ type: 'add', field: 'label', value: '{{ parameters.Username }}' }],
      };

      const res = await testWithCredential(await basicCredential(), {
        manifest: { ...BASIC_MANIFEST, nodes: { items } },
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(
        'Key parameter "Username" cannot be used in transformations.add of node "items"'
      );
      expect(JSON.stringify(res.body)).not.toContain(USERNAME);
    });

    it('a Credential test ignores a half-written sibling node', async () => {
      const draft = { ...BASIC_MANIFEST.nodes.items, recordSelector: { recordPath: 'data.items' } };

      const res = await testWithCredential(await basicCredential(), {
        manifest: { ...BASIC_MANIFEST, nodes: { ...BASIC_MANIFEST.nodes, draft } },
      });

      expect(res.status).toBe(201);
      expect(res.body.rows[0]).toMatchObject({ Username: '***', Password: '***' });
    });

    it('a Credential test still refuses misuse in the node under test', async () => {
      const credentialId = await basicCredential();
      const leaky = {
        ...BASIC_MANIFEST.nodes.items,
        transformations: [{ type: 'add', field: 'label', value: '{{ parameters.Password }}' }],
      };
      const manifest = { ...BASIC_MANIFEST, nodes: { ...BASIC_MANIFEST.nodes, leaky } };

      const underTest = await agent
        .post('/api/connectors/custom/test')
        .set(AUTH_HEADER)
        .send({ manifest, node: 'leaky', configuration: {}, credentialId });
      const sibling = await testWithCredential(credentialId, { manifest });

      expect(underTest.status).toBe(400);
      expect(underTest.body.message).toContain(
        'Key parameter "Password" cannot be used in transformations.add of node "leaky"'
      );
      expect(sibling.status).toBe(201);
      expect(JSON.stringify([underTest.body, sibling.body])).not.toContain(PASSWORD);
    });

    it('typed values behave as before', async () => {
      const res = await agent
        .post('/api/connectors/custom/test')
        .set(AUTH_HEADER)
        .send({
          manifest: BASIC_MANIFEST,
          node: 'items',
          configuration: { Username: USERNAME, Password: PASSWORD },
        });

      expect(res.status).toBe(201);
      expect(res.body.logs).toContain('keys=none');
      expect(res.body.rows[0]).toMatchObject({ Username: USERNAME, Password: PASSWORD });
      expect(res.body.logs).toContain(
        'The provider issued new credentials during this test; they were not stored.'
      );
    });
  });

  describe('POST /connectors/custom/fitting-credentials', () => {
    const FIT_MANIFEST = { ...BASIC_MANIFEST, name: 'FitApi', baseUrl: 'https://fit.example.com' };
    const fittingIds = (body: { id: string; refusal: unknown }[]) =>
      body.filter(item => item.refusal === null).map(item => item.id);
    const listed = (body: { id: string }[], id: string) => body.find(item => item.id === id);

    it('lists the Credentials the caller can use, refused ones with their reason, without values', async () => {
      const adminOnly = await basicCredential({ host: 'fit.example.com' });
      const editorOwned = await basicCredential({ host: 'fit.example.com', ownerIds: ['1'] });
      const otherHost = await basicCredential({ host: 'elsewhere.example.com', ownerIds: ['1'] });
      const disabled = await basicCredential({ host: 'fit.example.com', ownerIds: ['1'] });
      const credentials = app.get(CredentialService);
      const toDisable = await credentials.findById(disabled);
      await credentials.save(Object.assign(toDisable!, { enabled: false }));

      const asAdmin = await agent
        .post('/api/connectors/custom/fitting-credentials')
        .set(AUTH_HEADER)
        .send({ manifest: FIT_MANIFEST });
      const asEditor = await agent
        .post('/api/connectors/custom/fitting-credentials')
        .set(EDITOR_AUTH_HEADER)
        .send({ manifest: FIT_MANIFEST });

      expect(asAdmin.status).toBe(201);
      const adminIds = fittingIds(asAdmin.body);
      expect(adminIds).toEqual(expect.arrayContaining([adminOnly, editorOwned]));
      expect(adminIds).not.toContain(otherHost);
      expect(listed(asAdmin.body, disabled)).toBeUndefined();
      expect(fittingIds(asEditor.body)).toEqual([editorOwned]);
      expect(listed(asEditor.body, adminOnly)).toBeUndefined();
      expect(listed(asEditor.body, editorOwned)).toEqual({
        id: editorOwned,
        title: expect.any(String),
        hosts: ['fit.example.com'],
        fieldKeys: ['Username', 'Password'],
        refusal: null,
      });
      expect(listed(asEditor.body, otherHost)).toMatchObject({
        refusal: {
          reason: 'unfit',
          message: 'This Credential cannot be used with this connector.',
        },
      });
      for (const value of [USERNAME, PASSWORD]) {
        expect(JSON.stringify(asAdmin.body)).not.toContain(value);
      }
    });

    it("lists for a selective manifest's default branch when no selection is sent", async () => {
      const credentialId = await basicCredential();

      const res = await agent
        .post('/api/connectors/custom/fitting-credentials')
        .set(AUTH_HEADER)
        .send({ manifest: SELECTIVE_MANIFEST, selection: '' });

      expect(res.status).toBe(201);
      expect(fittingIds(res.body)).toContain(credentialId);
    });

    it('resolves the manifest of a published connector by name', async () => {
      const connectorName = `FitByName${Date.now()}`;
      const created = await agent
        .post('/api/connectors/custom')
        .set(AUTH_HEADER)
        .send({
          name: connectorName,
          title: 'Fit by name',
          manifest: {
            ...BASIC_MANIFEST,
            name: connectorName,
            baseUrl: 'https://byname.example.com',
          },
        });
      expect(created.status).toBe(201);
      const published = await agent
        .post(`/api/connectors/custom/${created.body.id}/publish`)
        .set(AUTH_HEADER);
      expect(published.status).toBe(201);
      const fitting = await basicCredential({ host: 'byname.example.com' });

      const res = await agent
        .post('/api/connectors/custom/fitting-credentials')
        .set(AUTH_HEADER)
        .send({ connectorName, version: 1 });

      expect(res.status).toBe(201);
      expect(fittingIds(res.body)).toEqual([fitting]);
    });

    it('fitting with a node ignores a broken sibling node', async () => {
      const fitting = await basicCredential({ host: 'sibling.example.com' });
      const draft = { ...FIT_MANIFEST.nodes.items, recordSelector: { recordPath: 'data.items' } };
      const manifest = {
        ...FIT_MANIFEST,
        baseUrl: 'https://sibling.example.com',
        nodes: { ...FIT_MANIFEST.nodes, draft },
      };

      const withNode = await agent
        .post('/api/connectors/custom/fitting-credentials')
        .set(AUTH_HEADER)
        .send({ manifest, node: 'items' });
      const whole = await agent
        .post('/api/connectors/custom/fitting-credentials')
        .set(AUTH_HEADER)
        .send({ manifest });

      expect(withNode.status).toBe(201);
      expect(fittingIds(withNode.body)).toEqual([fitting]);
      expect(whole.status).toBe(400);
      expect(whole.body.message).toContain('Invalid manifest');
    });

    it('credential-requirement names what a fitting Credential holds, for editors only', async () => {
      const asEditor = await agent
        .post('/api/connectors/custom/credential-requirement')
        .set(EDITOR_AUTH_HEADER)
        .send({ manifest: FIT_MANIFEST });
      const asViewer = await agent
        .post('/api/connectors/custom/credential-requirement')
        .set(VIEWER_AUTH_HEADER)
        .send({ manifest: FIT_MANIFEST });

      expect(asEditor.status).toBe(201);
      expect(asEditor.body).toEqual({
        hosts: ['fit.example.com'],
        fieldList: [
          { key: 'Username', label: 'Username', secret: false, required: true },
          { key: 'Password', label: 'Password', secret: true, required: true },
        ],
        keyParameters: ['Username', 'Password'],
        misuse: [],
      });
      expect(asViewer.status).toBe(403);
    });

    it('a Credential is created from the requirement field list as returned', async () => {
      const requirement = await agent
        .post('/api/connectors/custom/credential-requirement')
        .set(EDITOR_AUTH_HEADER)
        .send({ manifest: FIT_MANIFEST });

      const created = await agent
        .post('/api/credentials')
        .set(AUTH_HEADER)
        .send({
          title: `Requirement ${Date.now()}`,
          definitionId: 'custom-connector',
          customConnector: {
            hosts: requirement.body.hosts,
            fieldList: requirement.body.fieldList,
            fields: { Username: 'u', Password: 'p' },
          },
        });

      expect(created.status).toBe(201);
      expect(created.body.publicMetadata.fieldList).toEqual([
        { key: 'Username', label: 'Username', secret: false },
        { key: 'Password', label: 'Password', secret: true },
      ]);
    });

    it('refuses a request with both a manifest and a connector name', async () => {
      const res = await agent
        .post('/api/connectors/custom/fitting-credentials')
        .set(AUTH_HEADER)
        .send({ manifest: BASIC_MANIFEST, connectorName: 'BasicApi' });

      expect(res.status).toBe(400);
    });
  });
});
