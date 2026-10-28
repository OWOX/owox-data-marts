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
import { z } from 'zod-v4';
import { IdpProviderService } from '../src/idp/services/idp-provider.service';
import { ConnectorTestService } from '../src/data-marts/services/connector/connector-test.service';
import { DataMartDefinitionValidatorFacade } from '../src/data-marts/data-storage-types/facades/data-mart-definition-validator-facade.service';

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
    const manifest = manifestFor('McpLiveTest');
    const result = await call(client, 'test_custom_connector', {
      manifest,
      node: 'items',
      configuration: { Token: 'test-only' },
      max_rows: 2,
      max_pages: 1,
    });
    expect(result).toMatchObject({
      rows: [{ i: 0 }, { i: 1 }],
      error: null,
      sample: [{ id: 1, name: 'a', nested: { k: 'v' } }],
    });
  });

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
    await agent
      .put(`/api/data-marts/${mart.body.id}/definition`)
      .set(AUTH_HEADER)
      .send({
        definitionType: 'CONNECTOR',
        definition: {
          connector: {
            source: {
              name,
              configuration: [{ Token: 'test-only' }],
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
});
