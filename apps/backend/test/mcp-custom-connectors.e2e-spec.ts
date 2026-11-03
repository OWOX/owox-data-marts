import { INestApplication } from '@nestjs/common';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { IdpProvider, McpScope, Role } from '@owox/idp-protocol';
import {
  AUTH_HEADER,
  closeTestApp,
  createTestApp,
  StorageBuilder,
  DataMartBuilder,
} from '@owox/test-utils';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { IdpProviderService } from '../src/idp/services/idp-provider.service';
import {
  ConnectorTestService,
  type ConnectorTestRequest,
} from '../src/data-marts/services/connector/connector-test.service';
import { DataMartDefinitionValidatorFacade } from '../src/data-marts/data-storage-types/facades/data-mart-definition-validator-facade.service';
import { createCredential } from './fixtures/storage-credentials';
import { Credential } from '../src/data-marts/credentials/entities/credential.entity';
import { ConnectorDefinition } from '../src/data-marts/entities/connector-definition.entity';
import {
  boundDestinationCredentialId,
  CHAT_WEBHOOK_URL,
  createChatWebhookCredential,
} from './fixtures/destination-credentials';

const manifestFor = (name: string) => ({
  version: '1.0',
  name,
  baseUrl: 'https://api.example.test',
  authentication: {
    type: 'bearer',
    inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ parameters.Token }}' },
  },
  parameters: { Token: { requiredType: 'string', isRequired: true, default: 'private-default' } },
  nodes: {
    items: {
      fields: { id: { type: 'string' }, name: { type: 'string' } },
      uniqueKeys: ['id'],
      request: { method: 'GET', path: '/items' },
      recordSelector: { recordPath: [] },
    },
  },
});

class LocalConnectorTestService extends ConnectorTestService {
  protected runnerPath(): string {
    return join(__dirname, 'fixtures/fake-test-runner.mjs');
  }

  async runTest(args: ConnectorTestRequest) {
    const echo = args.credential || Object.keys(args.configuration).length > 0;
    return super.runTest(args, echo ? { env: { FAKE_KEY_ECHO: '1' } } : undefined);
  }
}

const testService = new LocalConnectorTestService();

describe('Custom connector MCP with real persistence and transport', () => {
  let app: INestApplication;
  let agent: Awaited<ReturnType<typeof createTestApp>>['agent'];
  let baseUrl: URL;
  let roles: Role[] = ['admin'];
  let scopes: McpScope[] = ['mcp:read', 'mcp:write'];
  let projectId = '0';
  let sequence = 0;
  const clients: Client[] = [];
  const previousMcpUrl = process.env.MCP_PUBLIC_BASE_URL;
  const previousAuthUrl = process.env.OWOX_AUTH_PUBLIC_BASE_URL;

  async function connect(era: 'legacy' | 'modern' = 'legacy') {
    const client = new Client(
      { name: 'custom-connector-test', version: '1' },
      era === 'modern' ? { versionNegotiation: { mode: 'auto' } } : undefined
    );
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(baseUrl, {
        authProvider: { token: async () => 'custom-connector-test-token' } as never,
      })
    );
    return client;
  }

  async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
    const result = await client.callTool({ name, arguments: args });
    expect(result).not.toMatchObject({ isError: true });
    return result.structuredContent as Record<string, unknown>;
  }

  async function create(client: Client) {
    const name = `McpCustomApi${++sequence}`;
    const manifest = manifestFor(name);
    const result = await call(client, 'create_custom_connector', {
      name,
      title: 'Custom API',
      description: 'Description',
      logo: 'logo',
      doc_url: 'https://example.test/connector',
      manifest,
    });
    return { connector_id: z.string().parse(result.connector_id), name, manifest };
  }

  const referenceManifest = () => ({
    ...manifestFor('McpCredentialTest'),
    parameters: { Token: { requiredType: 'string', isRequired: true } },
  });

  async function testCredential(overrides: Partial<Parameters<typeof createCredential>[1]> = {}) {
    return createCredential(app, {
      projectId: '0',
      definitionId: 'custom-connector',
      title: 'MCP test Credential',
      secret: { fields: { Token: 'mcp-private-token' } },
      publicMetadata: {
        hosts: ['api.example.test'],
        fieldList: [{ key: 'Token', label: 'Token', secret: true }],
        fields: {},
      },
      ownerIds: ['0'],
      contextIds: [],
      ...overrides,
    });
  }

  beforeAll(async () => {
    process.env.OWOX_AUTH_PUBLIC_BASE_URL = 'https://app.owox.com';
    const testApp = await createTestApp([
      { provide: ConnectorTestService, useValue: testService },
      {
        provide: DataMartDefinitionValidatorFacade,
        useValue: { checkIsValid: jest.fn().mockResolvedValue(undefined) },
      },
    ]);
    app = testApp.app;
    agent = testApp.agent;
    const provider = app.get(IdpProviderService).getProviderFromApp();
    jest.spyOn(provider, 'verifyMcpAccessToken').mockImplementation(
      async (_token, resource) =>
        ({
          clientId: 'custom-connector-test',
          projectId,
          userId: roles.includes('admin') ? '0' : '1',
          roles,
          scopes,
          resource,
          authFlow: 'mcp',
        }) as Awaited<ReturnType<IdpProvider['verifyMcpAccessToken']>>
    );
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    process.env.MCP_PUBLIC_BASE_URL = `http://127.0.0.1:${port}`;
    baseUrl = new URL(`http://127.0.0.1:${port}/mcp`);
  }, 120000);

  beforeEach(() => {
    roles = ['admin'];
    scopes = ['mcp:read', 'mcp:write'];
    projectId = '0';
  });
  afterEach(async () => {
    for (const client of clients.splice(0)) await client.close();
  });
  afterAll(async () => {
    await new Promise<void>(resolve => setImmediate(resolve));
    if (app) await closeTestApp(app);
    if (previousMcpUrl === undefined) delete process.env.MCP_PUBLIC_BASE_URL;
    else process.env.MCP_PUBLIC_BASE_URL = previousMcpUrl;
    if (previousAuthUrl === undefined) delete process.env.OWOX_AUTH_PUBLIC_BASE_URL;
    else process.env.OWOX_AUTH_PUBLIC_BASE_URL = previousAuthUrl;
  });

  it.each(['legacy', 'modern'] as const)(
    'supports the complete authoring lifecycle over %s MCP',
    async era => {
      const client = await connect(era);
      const { connector_id, manifest, name } = await create(client);
      const target = { connector_id };
      expect((await call(client, 'list_custom_connectors')).connectors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ connector_id, name, active_version: null }),
        ])
      );
      expect(await call(client, 'get_custom_connector', target)).toMatchObject({
        connector_id,
        versions: [{ version: 1, status: 'draft', published_at: null }],
      });
      expect(await call(client, 'get_custom_connector_version', { ...target, version: 1 })).toEqual(
        { version: 1, status: 'draft', manifest }
      );
      expect(
        (
          await client.callTool({
            name: 'get_custom_connector_specification',
            arguments: { ...target, version: 1 },
          })
        ).isError
      ).toBe(true);
      expect(
        await call(client, 'update_custom_connector', {
          ...target,
          title: 'Renamed display',
          description: null,
        })
      ).toMatchObject({ title: 'Renamed display', name, description: null });
      const httpMetadata = await agent
        .get(`/api/connectors/custom/${connector_id}`)
        .set(AUTH_HEADER);
      expect(httpMetadata.body).toMatchObject({
        logo: 'logo',
        docUrl: 'https://example.test/connector',
        description: null,
      });
      const published = await call(client, 'publish_custom_connector', target);
      expect(published).toMatchObject({
        version: 1,
        status: 'published',
        warnings: expect.any(Array),
        published_at: expect.any(String),
        stopping_data_marts: [],
        hidden_stopping_count: 0,
      });
      const specification = await call(client, 'get_custom_connector_specification', target);
      expect(JSON.stringify(specification)).not.toContain('private-default');
      expect(specification.specification).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Token',
            attributes: expect.arrayContaining(['SECRET']),
          }),
        ])
      );
      expect((await call(client, 'get_custom_connector_fields', target)).fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'items',
            uniqueKeys: ['id'],
            fields: expect.arrayContaining([{ name: 'id', type: 'STRING' }]),
          }),
        ])
      );
      expect(
        await call(client, 'save_custom_connector_draft', {
          ...target,
          manifest: { ...manifest, baseUrl: 'https://api-v2.example.test' },
        })
      ).toEqual({ version: 2, status: 'draft' });
      expect(
        (
          await client.callTool({
            name: 'activate_custom_connector_version',
            arguments: { ...target, version: 2 },
          })
        ).isError
      ).toBe(true);
      expect((await call(client, 'get_custom_connector', target)).active_version).toBe(1);
      await call(client, 'publish_custom_connector', target);
      expect((await call(client, 'get_custom_connector', target)).active_version).toBe(2);
      expect(
        await call(client, 'activate_custom_connector_version', { ...target, version: 1 })
      ).toMatchObject({ active_version: 1, active_version_id: expect.any(String) });
      const http = await agent
        .get(`/api/connectors/custom/${connector_id}`)
        .set(AUTH_HEADER)
        .expect(200);
      expect(http.body).toMatchObject({ activeVersion: 1, name });
      expect(await call(client, 'delete_custom_connector', target)).toEqual({ success: true });
      expect(
        (await client.callTool({ name: 'get_custom_connector', arguments: target })).isError
      ).toBe(true);
      expect((await call(client, 'list_custom_connectors')).connectors).not.toEqual(
        expect.arrayContaining([expect.objectContaining(target)])
      );
    }
  );

  it('returns bounded rows and raw samples through the child-process runner', async () => {
    const client = await connect();
    const manifest = { ...manifestFor('McpLiveTest'), authentication: undefined, parameters: {} };
    const result = await call(client, 'test_custom_connector', {
      manifest,
      node: 'items',
      configuration: {},
      max_rows: 2,
      max_pages: 1,
    });
    expect(result).toMatchObject({
      rows: [{ i: 0 }, { i: 1 }],
      error: null,
      sample: [{ id: 1, name: 'a', nested: { k: 'v' } }],
    });
  });

  it.each(['legacy', 'modern'] as const)(
    'tests with a saved Credential over %s MCP and masks echoed and rotated secrets',
    async era => {
      const credentialId = await testCredential();
      const client = await connect(era);
      const result = await call(client, 'test_custom_connector', {
        manifest: referenceManifest(),
        node: 'items',
        configuration: {},
        credential_id: credentialId,
      });

      expect(result).toMatchObject({
        rows: [expect.objectContaining({ Token: '[REDACTED]', rotated: '[REDACTED]' })],
        sample: [expect.objectContaining({ Token: '[REDACTED]' })],
        error: null,
      });
      expect(JSON.stringify(result)).not.toContain('mcp-private-token');
      expect(JSON.stringify(result)).not.toContain('rotated-token-from-provider');
    }
  );

  it.each(['legacy', 'modern'] as const)(
    'tests temporary credentials over %s MCP without saving them or exposing their values',
    async era => {
      const client = await connect(era);
      const dataSource = app.get(DataSource);
      const counts = () =>
        Promise.all([
          dataSource.getRepository(Credential).count(),
          dataSource.getRepository(ConnectorDefinition).count(),
        ]);
      const before = await counts();
      const base = referenceManifest();
      const secret = 'temporary/"mcp-secret"';
      const cases = [
        { manifest: base, configuration: { Token: secret } },
        { manifest: manifestFor('McpDefaultKeyTest'), configuration: { Region: 'eu' } },
        {
          manifest: {
            ...base,
            authentication: undefined,
            parameters: {
              Value: { requiredType: 'string' },
              PageToken: { requiredType: 'string' },
            },
            nodes: {
              items: {
                ...base.nodes.items,
                request: {
                  ...base.nodes.items.request,
                  headers: { Authorization: 'Bearer {{ parameters.Value }}' },
                  queryParameters: { page_token: '{{ parameters.PageToken }}' },
                },
              },
            },
          },
          configuration: { Value: secret, PageToken: 'next-page' },
        },
      ];

      for (const args of cases) {
        const result = await client.callTool({
          name: 'test_custom_connector',
          arguments: { ...args, node: 'items' },
        });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({
          rows: [expect.objectContaining({ rotated: '***' })],
          logs: expect.arrayContaining([
            'The provider issued new credentials during this test; they were not stored.',
          ]),
          error: null,
        });
        for (const value of [
          secret,
          encodeURIComponent(secret),
          'private-default',
          'rotated-token-from-provider',
        ]) {
          expect(JSON.stringify(result)).not.toContain(value);
        }
        if ('Value' in args.configuration) {
          expect(result.structuredContent).toMatchObject({
            rows: [expect.objectContaining({ Value: '[REDACTED]', PageToken: 'next-page' })],
            sample: [expect.objectContaining({ Value: '[REDACTED]', PageToken: 'next-page' })],
          });
        }
      }
      expect(await counts()).toEqual(before);
    }
  );

  it.each(['legacy', 'modern'] as const)(
    'rejects unknown secret fields over %s MCP before starting a test',
    async era => {
      const client = await connect(era);
      const runner = jest.spyOn(testService, 'runTest');
      try {
        const result = await client.callTool({
          name: 'test_custom_connector',
          arguments: {
            manifest: referenceManifest(),
            node: 'items',
            configuration: {},
            credential: { secret: 'do-not-run' },
          },
        });
        expect(result.isError).toBe(true);
        expect(JSON.stringify(result)).not.toContain('do-not-run');
        expect(runner).not.toHaveBeenCalled();
      } finally {
        runner.mockRestore();
      }
    }
  );

  it.each(['use', 'host', 'project', 'provider'] as const)(
    'refuses a Credential with incompatible %s before starting a test',
    async restriction => {
      const credentialId = await testCredential(
        restriction === 'host'
          ? {
              publicMetadata: {
                hosts: ['elsewhere.test'],
                fieldList: [{ key: 'Token', label: 'Token', secret: true }],
                fields: {},
              },
            }
          : restriction === 'project'
            ? { projectId: 'other-project' }
            : restriction === 'provider'
              ? {
                  definitionId: 'google-chat-webhook',
                  publicMetadata: null,
                  secret: { fields: { webhookUrl: CHAT_WEBHOOK_URL } },
                }
              : {}
      );
      if (restriction === 'use') roles = ['editor'];
      const client = await connect();
      const runner = jest.spyOn(testService, 'runTest');
      try {
        const result = await client.callTool({
          name: 'test_custom_connector',
          arguments: {
            manifest: referenceManifest(),
            node: 'items',
            configuration: {},
            credential_id: credentialId,
          },
        });
        expect(result.isError).toBe(true);
        expect(runner).not.toHaveBeenCalled();
        expect(JSON.stringify(result)).not.toContain('mcp-private-token');
        expect(JSON.stringify(result)).not.toContain(CHAT_WEBHOOK_URL);
      } finally {
        runner.mockRestore();
      }
    }
  );

  it.each(['legacy', 'modern'] as const)(
    'creates an unshared webhook destination from a Credential over %s MCP',
    async era => {
      const credentialId = await createChatWebhookCredential(app, {
        projectId: '0',
        title: 'MCP Chat key',
        ownerIds: ['0'],
      });
      const client = await connect(era);
      const result = await call(client, 'add_destination', {
        destination_type: 'google_chat',
        title: 'MCP Chat target',
        credential_id: credentialId,
      });
      const destinationId = z.string().parse(result.destination_id);

      expect(await boundDestinationCredentialId(app, destinationId)).toBe(credentialId);
      const saved = await agent
        .get(`/api/data-destinations/${destinationId}`)
        .set(AUTH_HEADER)
        .expect(200);
      expect(saved.body).toMatchObject({ availableForUse: false, title: 'MCP Chat target' });
      expect(JSON.stringify(result)).not.toContain(CHAT_WEBHOOK_URL);
      expect(JSON.stringify(result)).not.toContain('webhookUrl');

      const rejected = await client.callTool({
        name: 'add_destination',
        arguments: {
          destination_type: 'google_chat',
          credential_id: credentialId,
          webhookUrl: CHAT_WEBHOOK_URL,
        },
      });
      expect(rejected.isError).toBe(true);
      expect(JSON.stringify(rejected)).not.toContain(CHAT_WEBHOOK_URL);
    }
  );

  it.each(['viewer', 'read-scope'] as const)(
    'enforces %s access before changing persisted data',
    async restriction => {
      const admin = await connect();
      const { connector_id, manifest } = await create(admin);
      await call(admin, 'publish_custom_connector', { connector_id });
      await call(admin, 'save_custom_connector_draft', { connector_id, manifest });
      const before = await agent
        .get(`/api/connectors/custom/${connector_id}`)
        .set(AUTH_HEADER)
        .expect(200);
      if (restriction === 'viewer') roles = ['viewer'];
      else {
        roles = ['editor'];
        scopes = ['mcp:read'];
      }
      const client = await connect();
      const reads = [
        ['list_custom_connectors', {}],
        ['get_custom_connector', { connector_id }],
        ['get_custom_connector_specification', { connector_id }],
        ['get_custom_connector_fields', { connector_id }],
      ] as const;
      for (const [name, args] of reads)
        expect(JSON.stringify(await call(client, name, args))).not.toContain('private-default');
      if (restriction === 'read-scope') {
        expect(
          await call(client, 'get_custom_connector_version', { connector_id, version: 2 })
        ).toMatchObject({ manifest, status: 'draft' });
      }
      const deniedName = `DeniedCreate${++sequence}`;
      const denied = [
        [
          'create_custom_connector',
          { name: deniedName, title: 'Denied', manifest: manifestFor(deniedName) },
        ],
        ['update_custom_connector', { connector_id, title: 'Denied' }],
        [
          'save_custom_connector_draft',
          { connector_id, manifest: { ...manifest, baseUrl: 'https://denied.example.test' } },
        ],
        [
          'test_custom_connector',
          { manifest, node: 'items', configuration: { Token: 'test-only' } },
        ],
        ['publish_custom_connector', { connector_id }],
        ['activate_custom_connector_version', { connector_id, version: 1 }],
        ['delete_custom_connector', { connector_id }],
        ...(restriction === 'viewer'
          ? [['get_custom_connector_version', { connector_id, version: 1 }]]
          : []),
      ] as Array<[string, Record<string, unknown>]>;
      for (const [name, args] of denied) {
        const result = await client.callTool({ name, arguments: args });
        expect(result).toMatchObject({
          isError: true,
          content: [
            {
              type: 'text',
              text:
                restriction === 'viewer'
                  ? 'Access denied. Required project role: editor'
                  : 'Missing MCP scope: mcp:write',
            },
          ],
        });
      }
      const http = await agent
        .get(`/api/connectors/custom/${connector_id}`)
        .set(AUTH_HEADER)
        .expect(200);
      expect(http.body).toEqual(before.body);
      roles = ['admin'];
      scopes = ['mcp:read', 'mcp:write'];
      expect(
        await call(admin, 'get_custom_connector_version', { connector_id, version: 2 })
      ).toMatchObject({ manifest, status: 'draft' });
      expect((await call(admin, 'list_custom_connectors')).connectors).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: deniedName })])
      );
      expect((await call(admin, 'publish_custom_connector', { connector_id })).version).toBe(2);
    }
  );

  it('rejects every ID-based operation across projects', async () => {
    const owner = await connect();
    const { connector_id, manifest } = await create(owner);
    await call(owner, 'publish_custom_connector', { connector_id });
    await call(owner, 'save_custom_connector_draft', { connector_id, manifest });
    const before = await call(owner, 'get_custom_connector', { connector_id });
    projectId = 'another-project';
    const stranger = await connect();
    expect(await call(stranger, 'list_custom_connectors')).toEqual({ connectors: [] });
    const operations = [
      ['get_custom_connector', {}],
      ['update_custom_connector', { title: 'Other' }],
      ['get_custom_connector_version', { version: 1 }],
      [
        'save_custom_connector_draft',
        { manifest: { ...manifest, baseUrl: 'https://denied.example.test' } },
      ],
      ['publish_custom_connector', {}],
      ['activate_custom_connector_version', { version: 1 }],
      ['delete_custom_connector', {}],
      ['get_custom_connector_specification', {}],
      ['get_custom_connector_fields', {}],
    ] as Array<[string, Record<string, unknown>]>;
    for (const [name, args] of operations) {
      const result = await stranger.callTool({ name, arguments: { connector_id, ...args } });
      expect(result).toMatchObject({
        isError: true,
        content: [{ type: 'text', text: `Custom connector '${connector_id}' not found` }],
      });
    }
    projectId = '0';
    expect(await call(owner, 'get_custom_connector', { connector_id })).toEqual(before);
    expect(
      await call(owner, 'get_custom_connector_version', { connector_id, version: 2 })
    ).toMatchObject({ manifest, status: 'draft' });
    expect((await call(owner, 'publish_custom_connector', { connector_id })).version).toBe(2);
  });

  it('preserves follower permissions and deletion restrictions', async () => {
    const admin = await connect();
    const { connector_id, name, manifest } = await create(admin);
    await call(admin, 'publish_custom_connector', { connector_id });
    const storage = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().build())
      .expect(201);
    const mart = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send(new DataMartBuilder().withStorageId(storage.body.id).build())
      .expect(201);
    const credentialId = await createCredential(app, {
      projectId: '0',
      definitionId: 'custom-connector',
      title: 'API Token',
      secret: { fields: { Token: 'test-only' } },
      publicMetadata: {
        hosts: ['api.example.test'],
        fieldList: [{ key: 'Token', label: 'Token', secret: true }],
        fields: {},
      },
      ownerIds: [],
      contextIds: [],
    });
    await agent
      .put(`/api/data-marts/${mart.body.id}/definition`)
      .set(AUTH_HEADER)
      .send({
        definitionType: 'CONNECTOR',
        definition: {
          connector: {
            source: {
              name,
              configuration: [{ _credential_id: credentialId }],
              node: 'items',
              fields: ['id', 'name'],
            },
            storage: { fullyQualifiedName: 'test_dataset.items' },
          },
        },
      })
      .expect(200);
    await agent
      .put(`/api/data-marts/${mart.body.id}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForReporting: true, availableForMaintenance: false })
      .expect(204);
    roles = ['editor'];
    const editor = await connect();
    await call(editor, 'save_custom_connector_draft', { connector_id, manifest });
    for (const [name, args] of [
      ['publish_custom_connector', { connector_id }],
      ['activate_custom_connector_version', { connector_id, version: 1 }],
      ['delete_custom_connector', { connector_id }],
    ] as Array<[string, Record<string, unknown>]>) {
      expect(await editor.callTool({ name, arguments: args })).toMatchObject({
        isError: true,
        content: [
          {
            type: 'text',
            text: expect.stringContaining(
              name === 'delete_custom_connector'
                ? 'referenced by existing data marts'
                : 'Data Marts you cannot edit'
            ),
          },
        ],
      });
    }
    const http = await agent
      .get(`/api/connectors/custom/${connector_id}`)
      .set(AUTH_HEADER)
      .expect(200);
    expect(http.body.activeVersion).toBe(1);
    expect(http.body.versions).toEqual(
      expect.arrayContaining([expect.objectContaining({ version: 2, status: 'draft' })])
    );
    roles = ['admin'];
    expect((await call(admin, 'publish_custom_connector', { connector_id })).version).toBe(2);
  });

  it('lists the Data Marts a publish or an activation stops, and none once the Credential fits again', async () => {
    const client = await connect();
    const { connector_id, name, manifest } = await create(client);
    await call(client, 'publish_custom_connector', { connector_id });
    const storage = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().build())
      .expect(201);
    const mart = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send(new DataMartBuilder().withStorageId(storage.body.id).build())
      .expect(201);
    const credentialId = await createCredential(app, {
      projectId: '0',
      definitionId: 'custom-connector',
      title: 'API Token',
      secret: { fields: { Token: 'test-only' } },
      publicMetadata: {
        hosts: ['api.example.test'],
        fieldList: [{ key: 'Token', label: 'Token', secret: true }],
        fields: {},
      },
      ownerIds: [],
      contextIds: [],
    });
    await agent
      .put(`/api/data-marts/${mart.body.id}/definition`)
      .set(AUTH_HEADER)
      .send({
        definitionType: 'CONNECTOR',
        definition: {
          connector: {
            source: {
              name,
              configuration: [{ _credential_id: credentialId }],
              node: 'items',
              fields: ['id', 'name'],
            },
            storage: { fullyQualifiedName: 'test_dataset.items' },
          },
        },
      })
      .expect(200);
    const stopped = { stopping_data_marts: [{ id: mart.body.id, title: mart.body.title }] };
    const none = { stopping_data_marts: [], hidden_stopping_count: 0 };

    await call(client, 'save_custom_connector_draft', {
      connector_id,
      manifest: { ...manifest, baseUrl: 'https://api-v2.example.test' },
    });

    expect(await call(client, 'publish_custom_connector', { connector_id })).toMatchObject({
      version: 2,
      ...stopped,
      hidden_stopping_count: 0,
    });
    expect(
      await call(client, 'activate_custom_connector_version', { connector_id, version: 1 })
    ).toMatchObject(none);
    expect(
      await call(client, 'activate_custom_connector_version', { connector_id, version: 2 })
    ).toMatchObject({ ...stopped, hidden_stopping_count: 0 });
  });
});
