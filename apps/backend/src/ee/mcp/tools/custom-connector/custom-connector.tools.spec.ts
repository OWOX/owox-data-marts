import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { ConfigService } from '@nestjs/config';
import { OFFLOAD_KEY } from '@owox/internal-helpers';
import { PublicOriginService } from '../../../../common/config/public-origin.service';
import { adminMcpContext } from '../../../../../test/fixtures/mcp-auth-context';
import type { McpCustomConnectorsFacade } from '../../../../data-marts/facades/mcp-custom-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { McpConfigService } from '../../config/mcp.config';
import { McpCallInstrumentation } from '../../observability/mcp-call-instrumentation';
import type { McpToolCallEvent } from '../../observability/mcp-tool-call-event';
import { McpSdkServerFactory } from '../../sdk/mcp-sdk-server.factory';
import { McpToolRegistry } from '../mcp-tool.registry';
import { ActivateCustomConnectorVersionTool } from './activate-custom-connector-version.tool';
import { CreateCustomConnectorTool } from './create-custom-connector.tool';
import { DeleteCustomConnectorTool } from './delete-custom-connector.tool';
import { GetCustomConnectorFieldsTool } from './get-custom-connector-fields.tool';
import { GetCustomConnectorSpecificationTool } from './get-custom-connector-specification.tool';
import { GetCustomConnectorVersionTool } from './get-custom-connector-version.tool';
import { GetCustomConnectorTool } from './get-custom-connector.tool';
import { ListCustomConnectorsTool } from './list-custom-connectors.tool';
import { PublishCustomConnectorTool } from './publish-custom-connector.tool';
import { SaveCustomConnectorDraftTool } from './save-custom-connector-draft.tool';
import { TestCustomConnectorTool } from './test-custom-connector.tool';
import { UpdateCustomConnectorTool } from './update-custom-connector.tool';

const manifest = {
  version: '1.0',
  parameters: { Value: { attributes: ['SECRET'], label: 'Credential' } },
  nodes: { items: { request: { path: '/items' } } },
};
const manifestWithKey = (key: unknown) => ({
  ...manifest,
  parameters: { Value: { ...manifest.parameters.Value, default: key } },
});
/** A manifest the connector parser accepts, so the tool reads the keys the engine uses. */
const parsedManifest = (authentication: unknown, parameters: Record<string, unknown>) => ({
  name: 'CustomApi',
  title: 'Custom API',
  version: '1.0',
  baseUrl: 'https://api.example.test',
  authentication,
  parameters,
  nodes: {
    items: {
      request: { path: '/items' },
      recordSelector: { path: [] },
      fields: { id: { type: 'string' } },
    },
  },
});
const keyedManifest = manifestWithKey('sensitive-content');
const maskedManifest = manifestWithKey('[REDACTED]');
const metadata = {
  id: 'connector',
  name: 'CustomApi',
  title: 'Custom API',
  description: null,
  logo: 'data:image/png;base64,ZmFrZQ==',
  docUrl: null,
  activeVersionId: 'version-id',
  activeVersion: 1,
};
const state = { version: 1, status: 'published' as const };
const detail = {
  ...metadata,
  versions: [{ ...state, publishedAt: new Date('2026-10-27T00:00:00Z') }],
};

describe('custom connector tools through the MCP SDK', () => {
  let facade: jest.Mocked<McpCustomConnectorsFacade>;
  let events: McpToolCallEvent[];
  const closers: Array<() => Promise<void>> = [];
  async function open(context: McpAuthContext = adminMcpContext) {
    const publicOrigin = new PublicOriginService(
      new ConfigService({ PUBLIC_ORIGIN: 'https://app.example.test/' })
    );
    const tools = [
      new ActivateCustomConnectorVersionTool(facade),
      new CreateCustomConnectorTool(facade, publicOrigin),
      new DeleteCustomConnectorTool(facade),
      new GetCustomConnectorFieldsTool(facade),
      new GetCustomConnectorSpecificationTool(facade),
      new GetCustomConnectorVersionTool(facade),
      new GetCustomConnectorTool(facade, publicOrigin),
      new ListCustomConnectorsTool(facade),
      new PublishCustomConnectorTool(facade, publicOrigin),
      new SaveCustomConnectorDraftTool(facade),
      new TestCustomConnectorTool(facade),
      new UpdateCustomConnectorTool(facade),
    ];
    const factory = new McpSdkServerFactory(
      new McpConfigService(new ConfigService()),
      new McpToolRegistry(tools),
      new McpCallInstrumentation(
        { publishExternalSafely: (event: McpToolCallEvent) => events.push(event) } as never,
        { get: () => undefined, set: () => {} } as never
      )
    );
    const server = factory.create(context);
    const client = new Client({ name: 'custom-connector-contract', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closers.push(async () => {
      await client.close();
      await server.close();
    });
    return client;
  }

  beforeEach(() => {
    events = [];
    facade = {
      list: jest.fn().mockResolvedValue([metadata]),
      get: jest.fn().mockResolvedValue(detail),
      create: jest.fn().mockResolvedValue(metadata),
      updateMetadata: jest.fn().mockResolvedValue(detail),
      getVersion: jest.fn().mockResolvedValue({ ...state, manifest }),
      saveDraft: jest.fn().mockResolvedValue({ version: 2, status: 'draft' }),
      publish: jest.fn().mockResolvedValue({
        ...state,
        publishedAt: new Date('2026-10-27T00:00:00Z'),
        warnings: ['Review authentication'],
        stoppingDataMarts: [],
        hiddenStoppingCount: 0,
      }),
      activate: jest.fn().mockResolvedValue({
        activeVersionId: 'version-id',
        activeVersion: 1,
        stoppingDataMarts: [],
        hiddenStoppingCount: 0,
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      getSpecification: jest.fn().mockResolvedValue([{ name: 'Limit', default: 25 }]),
      getFields: jest
        .fn()
        .mockResolvedValue([
          { name: 'items', uniqueKeys: ['id'], fields: [{ name: 'id', type: 'string' }] },
        ]),
      test: jest.fn().mockResolvedValue({
        rows: [{ id: 'item-1' }],
        logs: ['Fetched one row using ***'],
        error: null,
        sample: [],
      }),
    };
  });
  afterEach(async () => {
    for (const close of closers.splice(0)) await close();
  });

  // The test tool reads the stored draft. A draft saved outside MCP can still hold a literal key.
  function storeDraft(stored: Record<string, unknown>) {
    facade.get.mockResolvedValue({
      ...detail,
      versions: [...detail.versions, { version: 2, status: 'draft', publishedAt: null }],
    });
    facade.getVersion.mockResolvedValue({ version: 2, status: 'draft', manifest: stored });
  }

  it('advertises strict inputs and marks live tests as external writes', async () => {
    const client = await open();
    const catalog = await client.listTools();
    for (const tool of catalog.tools) expect(tool.inputSchema.additionalProperties).toBe(false);
    expect(
      catalog.tools.find(tool => tool.name === 'test_custom_connector')?.annotations
    ).toMatchObject({ readOnlyHint: false, openWorldHint: true });
  });

  it.each(['list_custom_connectors', 'get_custom_connector', 'update_custom_connector'])(
    '%s returns public metadata with MCP keys and no inline logo',
    async name => {
      const client = await open();
      const result = await client.callTool({
        name,
        arguments: name === 'list_custom_connectors' ? {} : { connector_id: 'connector' },
      });
      const expected = {
        connector_id: 'connector',
        name: 'CustomApi',
        title: 'Custom API',
        description: null,
        doc_url: null,
        active_version_id: 'version-id',
        active_version: 1,
      };
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual(
        name === 'list_custom_connectors'
          ? { connectors: [expected] }
          : {
              ...expected,
              versions: [
                { version: 1, status: 'published', published_at: '2026-10-27T00:00:00.000Z' },
              ],
              ...(name === 'get_custom_connector'
                ? { url: 'https://app.example.test/ui/project-1/connectors/builder/connector' }
                : {}),
            }
      );
      expect(JSON.stringify(events[0].payload[OFFLOAD_KEY]?.result)).not.toContain(metadata.logo);
    }
  );

  it('maps the Credential reference, actor, configuration and MCP limits to the domain request', async () => {
    const client = await open();
    storeDraft(manifest);
    await client.callTool({
      name: 'test_custom_connector',
      arguments: {
        connector_id: 'connector',
        node: 'items',
        configuration: { Region: 'eu' },
        credential_id: 'credential-1',
        max_rows: 2,
        max_pages: 3,
      },
    });
    expect(facade.getVersion).toHaveBeenCalledWith('project-1', 'connector', 2);
    expect(facade.test).toHaveBeenCalledWith(
      { projectId: 'project-1', userId: 'user-1', roles: ['admin'] },
      {
        manifest,
        node: 'items',
        configuration: { Region: 'eu' },
        credentialId: 'credential-1',
        maxRows: 2,
        maxPages: 3,
      }
    );
    expect(events[0].payload[OFFLOAD_KEY]?.arguments).toEqual({
      connector_id: 'connector',
      node: 'items',
      configuration: '[REDACTED]',
      credential_id: 'credential-1',
      max_rows: 2,
      max_pages: 3,
    });
  });

  it('tests only a saved draft', async () => {
    const client = await open();
    const result = await client.callTool({
      name: 'test_custom_connector',
      arguments: { connector_id: 'connector', node: 'items', configuration: {} },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('This connector has no draft');
    expect(facade.getVersion).not.toHaveBeenCalled();
    expect(facade.test).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'a SECRET parameter', manifest, name: 'Value' },
    {
      label: 'an authentication parameter',
      manifest: {
        ...manifest,
        authentication: {
          type: 'bearer',
          inject: {
            into: 'header',
            name: 'Authorization',
            format: 'Bearer {{ parameters.Token }}',
          },
        },
        parameters: { Token: { requiredType: 'string' } },
      },
      name: 'Token',
    },
    {
      label: 'an unmarked Authorization parameter',
      manifest: {
        parameters: { Value: { requiredType: 'string' } },
        nodes: {
          items: { request: { headers: { Authorization: 'Bearer {{ parameters.Value }}' } } },
        },
      },
      name: 'Value',
    },
    {
      label: 'a parameter in an X-Token header',
      manifest: {
        parameters: { Token: { requiredType: 'string' } },
        nodes: { items: { request: { headers: { 'X-Token': '{{ parameters.Token }}' } } } },
      },
      name: 'Token',
    },
    {
      label: 'an OAuth client ID',
      manifest: parsedManifest(
        {
          type: 'oauth2',
          tokenUrl: 'https://api.example.test/token',
          grantType: 'refresh_token',
          clientId: '{{ parameters.ClientId }}',
          clientSecret: '{{ parameters.ClientSecret }}',
          refreshToken: '{{ parameters.RefreshToken }}',
        },
        {
          ClientId: { requiredType: 'string' },
          ClientSecret: { requiredType: 'string', attributes: ['SECRET'] },
          RefreshToken: { requiredType: 'string', attributes: ['SECRET'] },
        }
      ),
      name: 'ClientId',
    },
    {
      label: 'a Basic username',
      manifest: parsedManifest(
        { type: 'basic', username: '{{ parameters.User }}', password: '{{ parameters.Pass }}' },
        {
          User: { requiredType: 'string' },
          Pass: { requiredType: 'string', attributes: ['SECRET'] },
        }
      ),
      name: 'User',
    },
  ])('rejects a key for $label in configuration before the test runs', async args => {
    const client = await open();
    storeDraft(args.manifest);
    for (const credential of [{}, { credential_id: 'credential-1' }]) {
      const result = await client.callTool({
        name: 'test_custom_connector',
        arguments: {
          connector_id: 'connector',
          node: 'items',
          configuration: { [args.name]: 'typed-key', Region: 'eu' },
          ...credential,
        },
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain(`Remove ${args.name} from configuration`);
      expect(JSON.stringify(result.content)).toContain('mark any other key parameter SECRET');
      expect(JSON.stringify({ result, events })).not.toContain('typed-key');
    }
    expect(facade.test).not.toHaveBeenCalled();
  });

  it('accepts the selection parameter of a selective authentication in configuration', async () => {
    const client = await open();
    storeDraft(
      parsedManifest(
        {
          type: 'selective',
          selectionParameter: 'AuthMode',
          authenticators: {
            apikey: {
              type: 'apiKey',
              inject: { into: 'header', name: 'X-API-Key', format: '{{ parameters.Key }}' },
            },
          },
        },
        {
          AuthMode: { requiredType: 'string' },
          Key: { requiredType: 'string', attributes: ['SECRET'] },
        }
      )
    );
    const result = await client.callTool({
      name: 'test_custom_connector',
      arguments: {
        connector_id: 'connector',
        node: 'items',
        configuration: { AuthMode: 'apikey' },
        credential_id: 'credential-1',
      },
    });
    expect(result.isError).not.toBe(true);
    expect(facade.test).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ configuration: { AuthMode: 'apikey' } })
    );
  });

  it('tests the newest draft', async () => {
    const client = await open();
    storeDraft(manifest);
    facade.get.mockResolvedValue({
      ...detail,
      versions: [
        ...detail.versions,
        { version: 2, status: 'draft', publishedAt: null },
        { version: 3, status: 'draft', publishedAt: null },
      ],
    });
    await client.callTool({
      name: 'test_custom_connector',
      arguments: { connector_id: 'connector', node: 'items', configuration: {} },
    });
    expect(facade.getVersion).toHaveBeenCalledWith(expect.anything(), 'connector', 3);
  });

  it('get_custom_connector_version shows a stored literal key as [REDACTED]', async () => {
    const client = await open();
    facade.getVersion.mockResolvedValue({ ...state, manifest: keyedManifest });
    const result = await client.callTool({
      name: 'get_custom_connector_version',
      arguments: { connector_id: 'connector', version: 1 },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({ ...state, manifest: maskedManifest });
    expect(JSON.stringify({ result, events })).not.toContain('sensitive-content');
    expect(keyedManifest.parameters.Value.default).toBe('sensitive-content');
  });

  it.each([
    ['create_custom_connector', { name: 'CustomApi', title: 'Custom API' }],
    ['save_custom_connector_draft', { connector_id: 'connector' }],
  ] as const)('%s rejects a literal key or a [REDACTED] value', async (name, args) => {
    const client = await open();
    for (const stored of [keyedManifest, maskedManifest]) {
      const result = await client.callTool({ name, arguments: { ...args, manifest: stored } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain(
        'Remove the keys at parameters.Value.default'
      );
      expect(JSON.stringify(result)).not.toContain('sensitive-content');
    }
    expect(facade.create).not.toHaveBeenCalled();
    expect(facade.saveDraft).not.toHaveBeenCalled();
  });

  it('save_custom_connector_draft saves a manifest that references its keys', async () => {
    const client = await open();
    const result = await client.callTool({
      name: 'save_custom_connector_draft',
      arguments: { connector_id: 'connector', manifest },
    });
    expect(result.isError).not.toBe(true);
    expect(facade.saveDraft).toHaveBeenCalledWith('project-1', 'connector', manifest);
  });

  it.each(['create_custom_connector', 'get_custom_connector', 'publish_custom_connector'])(
    'returns an encoded Builder link from %s using the configured public origin',
    async name => {
      const connectorId = 'connector/#é';
      const client = await open({ ...adminMcpContext, projectId: 'project /?é' });
      facade.create.mockResolvedValue({ ...metadata, id: connectorId });
      facade.get.mockResolvedValue({ ...detail, id: connectorId });
      const result = await client.callTool({
        name,
        arguments:
          name === 'create_custom_connector'
            ? { name: 'CustomApi', title: 'Custom API', manifest }
            : { connector_id: connectorId },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        url: 'https://app.example.test/ui/project%20%2F%3F%C3%A9/connectors/builder/connector%2F%23%C3%A9',
      });
    }
  );

  it('reports the Data Marts a publish or activation stops', async () => {
    const client = await open();
    const stopping = {
      stoppingDataMarts: [{ id: 'dm-1', title: 'Orders' }],
      hiddenStoppingCount: 3,
    };
    const expected = {
      stopping_data_marts: [{ id: 'dm-1', title: 'Orders' }],
      hidden_stopping_count: 3,
    };
    facade.publish.mockResolvedValue({
      ...state,
      publishedAt: null,
      warnings: [],
      ...stopping,
    });
    facade.activate.mockResolvedValue({
      activeVersionId: 'version-id',
      activeVersion: 1,
      ...stopping,
    });
    const published = await client.callTool({
      name: 'publish_custom_connector',
      arguments: { connector_id: 'connector' },
    });
    expect(published.structuredContent).toMatchObject(expected);
    const activated = await client.callTool({
      name: 'activate_custom_connector_version',
      arguments: { connector_id: 'connector', version: 1 },
    });
    expect(activated.structuredContent).toMatchObject(expected);
  });

  it('bounds the test log trail while retaining final diagnostics, rows and raw sample', async () => {
    const client = await open();
    const diagnostic = 'This test ran only node items; another node cannot be published.';
    const logs = [
      ...Array.from({ length: 80 }, (_, i) => `Request ${i}: ${'x'.repeat(300)}`),
      diagnostic,
    ];
    const raw = { rows: [{ id: 1 }], sample: [{ id: 1, extra: 'raw value' }], logs, error: null };
    facade.test.mockResolvedValue(raw);
    storeDraft(manifest);
    const result = await client.callTool({
      name: 'test_custom_connector',
      arguments: { connector_id: 'connector', node: 'items', configuration: {} },
    });
    expect(result.isError).not.toBe(true);
    const content = result.structuredContent as { logs: string[] };
    expect(content.logs[0]).toMatch(/^… \d+ earlier log line\(s\) omitted$/);
    expect(content.logs.at(-1)).toBe(diagnostic);
    expect(content.logs.length).toBeLessThanOrEqual(51);
    expect(content.logs.join('').length).toBeLessThanOrEqual(8000);
    expect(content).toMatchObject({ rows: raw.rows, sample: raw.sample, error: null });
    expect(raw.logs).toHaveLength(81);
    expect(events[0].payload[OFFLOAD_KEY]?.result).toEqual(content);
  });

  const draft = { connector_id: 'connector' };
  it.each([
    ['list_custom_connectors', { project_id: 'other' }],
    ['create_custom_connector', { name: 'N', title: 'T', manifest, user_id: 'other' }],
    ['create_custom_connector', { name: 'N', title: 'T', manifest: [] }],
    [
      'create_custom_connector',
      { name: 'N', title: 'T', manifest: { pad: 'x'.repeat(120 * 1024) } },
    ],
    [
      'create_custom_connector',
      { name: 'N', title: 'T', manifest, description: '€'.repeat(21846) },
    ],
    ['create_custom_connector', { name: 'N', title: 'T', manifest, logo: '€'.repeat(21846) }],
    ['create_custom_connector', { name: 'N', title: '☕️'.repeat(128), manifest }],
    ['update_custom_connector', { connector_id: 'connector', doc_url: '☕️'.repeat(128) }],
    ['update_custom_connector', { connector_id: 'connector', name: 'Rename' }],
    ['update_custom_connector', { connector_id: 'connector', title: null }],
    ['update_custom_connector', { connector_id: 'connector', doc_url: 'a'.repeat(256) }],
    ['get_custom_connector', { connector_id: '' }],
    ['get_custom_connector_version', { connector_id: 'connector', version: 1.1 }],
    ['get_custom_connector_fields', { connector_id: 'connector', version: 0 }],
    [
      'test_custom_connector',
      { ...draft, node: 'items', configuration: { pad: 'x'.repeat(120 * 1024) } },
    ],
    ['test_custom_connector', { ...draft, node: 'items', configuration: {}, max_rows: 1001 }],
    ['test_custom_connector', { ...draft, node: 'items', configuration: {}, max_pages: 51 }],
    ['test_custom_connector', { ...draft, node: 'items', configuration: {}, max_pages: 1.5 }],
    ['test_custom_connector', { ...draft, node: 'items', configuration: {}, credential_id: '' }],
    [
      'test_custom_connector',
      { ...draft, node: 'items', configuration: {}, credential: { secret: 'private-token' } },
    ],
    ['test_custom_connector', { ...draft, manifest, node: 'items', configuration: {} }],
    ['test_custom_connector', { node: 'items', configuration: {} }],
  ])('rejects invalid %s input before reaching the domain', async (name, args) => {
    const client = await open();
    const result = await client.callTool({
      name: name as string,
      arguments: args as Record<string, unknown>,
    });
    expect(result.isError).toBe(true);
    for (const method of Object.values(facade)) expect(method).not.toHaveBeenCalled();
  });

  it('accepts metadata at the Unicode and UTF-8 byte limits', async () => {
    const client = await open();
    const result = await client.callTool({
      name: 'create_custom_connector',
      arguments: {
        name: 'CustomApi',
        title: '😀'.repeat(255),
        description: '€'.repeat(21845),
        manifest,
      },
    });
    expect(result.isError).not.toBe(true);
  });

  it.each([
    {
      label: 'a literal api-key in a token exchange body',
      manifest: {
        authentication: {
          type: 'tokenExchange',
          exchange: { body: { 'api-key': 'temporary/"secret-value"' } },
        },
      },
      configuration: {},
    },
    {
      label: 'a literal X-API-Key in a token exchange header',
      manifest: {
        authentication: {
          type: 'tokenExchange',
          exchange: { headers: { 'X-API-Key': 'temporary/"secret-value"' } },
        },
      },
      configuration: {},
    },
    {
      label: 'a literal OAuth client secret in an authentication option',
      manifest: {
        parameters: {
          Auth: {
            oneOf: [{ value: 'oauth', oauthParams: { clientSecret: 'temporary/"secret-value"' } }],
          },
        },
      },
      configuration: {},
    },
    {
      label: 'a literal secret in the request URL',
      manifest: { baseUrl: 'https://example.test?api_key=temporary%2F%22secret-value%22' },
      configuration: {},
    },
  ])('masks $label in test results and telemetry before truncating logs', async args => {
    const client = await open();
    const secret = 'temporary/"secret-value"';
    const raw = {
      rows: [{ echoed: secret, region: 'eu' }],
      sample: [{ echoed: encodeURIComponent(secret) }],
      logs: [`${'x'.repeat(1990)}${secret}`],
      error: `Request rejected ${JSON.stringify(secret)}`,
    };
    facade.test.mockResolvedValue(raw);
    storeDraft(args.manifest);

    const result = await client.callTool({
      name: 'test_custom_connector',
      arguments: { connector_id: 'connector', node: 'items', configuration: args.configuration },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      rows: [{ echoed: '[REDACTED]', region: 'eu' }],
      sample: [{ echoed: '[REDACTED]' }],
      error: 'Request rejected "[REDACTED]"',
    });
    expect(result.content[0]).toEqual({ type: 'text', text: 'Request rejected "[REDACTED]"' });
    expect(JSON.stringify({ result, events })).not.toContain('temporary');
    expect(raw.rows[0].echoed).toBe(secret);
  });

  it.each(['sk_live_A1B2C3D4', 123456, '123456', 'sample'])(
    'masks the manifest key %j in every result position and telemetry',
    async secret => {
      const client = await open();
      const text = String(secret);
      const echo = text === '123456' ? 123456 : secret;
      const raw = {
        rows: [{ [text]: { echoed: echo }, region: 'eu', count: 7 }],
        sample: [{ [`prefix-${text}`]: [text, { echoed: echo }] }],
        logs: [`Received ${text}`],
        error: `Rejected ${text}`,
      };
      const before = structuredClone(raw);
      facade.test.mockResolvedValue(raw);
      storeDraft(manifestWithKey(secret));

      const result = await client.callTool({
        name: 'test_custom_connector',
        arguments: { connector_id: 'connector', node: 'items', configuration: {} },
      });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toEqual({
        rows: [{ '[REDACTED]': { echoed: '[REDACTED]' }, region: 'eu', count: 7 }],
        sample: [{ 'prefix-[REDACTED]': ['[REDACTED]', { echoed: '[REDACTED]' }] }],
        logs: ['Received [REDACTED]'],
        error: 'Rejected [REDACTED]',
      });
      expect(result.content[0]).toEqual({ type: 'text', text: 'Rejected [REDACTED]' });
      expect(JSON.parse((result.content[1] as { text: string }).text)).toEqual(
        result.structuredContent
      );
      expect(events[0].payload.error_message).toBe('Rejected [REDACTED]');
      const logged = events[0].payload[OFFLOAD_KEY]?.result as Record<string, unknown>;
      expect(logged.rows).toEqual((result.structuredContent as Record<string, unknown>).rows);
      expect(raw).toEqual(before);
    }
  );

  it.each([false, true])(
    'preserves provider data with public token counters in input: %s',
    async withCounters => {
      const client = await open();
      const row = {
        id: 'inv_1500',
        amount: 1500,
        errors: 0,
        total_tokens: 1500,
        cached_tokens: 0,
        password_changed_at: '2026-11-04',
        updated_at: '2026-11-04',
        authorization_status: 'approved',
        status: 'approved',
        NextToken: 'page-1500',
        next_page: 'page-1500',
      };
      const raw = {
        rows: [row],
        sample: [row],
        logs: ['inv_1500 took 1500 ms with 0 errors on 2026-11-04; approved; page-1500'],
        error: null,
      };
      const before = structuredClone(raw);
      facade.test.mockResolvedValue(raw);
      storeDraft({
        nodes: {
          items: {
            request: {
              path: '/items?cached_tokens=0',
              queryParameters: { total_tokens: '{{ parameters.total_tokens }}' },
            },
          },
        },
        ...(withCounters
          ? { parameters: { total_tokens: { default: 1500 }, cached_tokens: { default: 0 } } }
          : {}),
      });

      const result = await client.callTool({
        name: 'test_custom_connector',
        arguments: {
          connector_id: 'connector',
          node: 'items',
          configuration: withCounters ? { total_tokens: 1500, cached_tokens: 0 } : {},
        },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual(before);
      expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(before);
      expect(events[0].payload[OFFLOAD_KEY]?.result).toEqual(before);
      expect(raw).toEqual(before);
    }
  );

  it('masks a zero-valued manifest key as complete values and keys', async () => {
    const client = await open();
    facade.test.mockResolvedValue({
      rows: [{ value: 0, id: 'inv_1500', amount: 1500 }],
      sample: [{ '0': 0 }],
      logs: ['0', 'took 1500 ms'],
      error: '0',
    });

    storeDraft(manifestWithKey(0));
    const result = await client.callTool({
      name: 'test_custom_connector',
      arguments: { connector_id: 'connector', node: 'items', configuration: {} },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      rows: [{ value: '[REDACTED]', id: 'inv_1500', amount: 1500 }],
      sample: [{ '[REDACTED]': '[REDACTED]' }],
      logs: ['[REDACTED]', 'took 1500 ms'],
      error: '[REDACTED]',
    });
    expect(events[0].payload.error_message).toBe('[REDACTED]');
    expect(events[0].payload[OFFLOAD_KEY]?.result).toEqual(result.structuredContent);
  });

  it.each(['runtime-secret', 123456, '123456'])(
    'masks the manifest key %j in a thrown error and its telemetry',
    async secret => {
      const client = await open();
      facade.test.mockRejectedValue(new Error(`Rejected ${secret}`));
      storeDraft(manifestWithKey(secret));

      const result = await client.callTool({
        name: 'test_custom_connector',
        arguments: { connector_id: 'connector', node: 'items', configuration: {} },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{ type: 'text', text: 'Rejected [REDACTED]' }]);
      expect(JSON.stringify({ result, events })).not.toContain(String(secret));
    }
  );

  it('reports a failed test without copying partial upstream data into inline telemetry', async () => {
    const client = await open();
    facade.test.mockResolvedValue({
      rows: [{ email: 'private@example.test', password: 'private-password' }],
      logs: ['Fetched one row using ***'],
      error: 'Request failed using ***',
      sample: [{ access_token: 'private-sample-token' }],
    });
    storeDraft(manifestWithKey('runtime-secret'));
    const result = await client.callTool({
      name: 'test_custom_connector',
      arguments: { connector_id: 'connector', node: 'items', configuration: {} },
    });
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(2);
    expect(result.content[0]).toEqual({ type: 'text', text: 'Request failed using ***' });
    expect(result.content[1]).toMatchObject({ type: 'text' });
    expect(JSON.parse((result.content[1] as { text: string }).text)).toEqual(
      result.structuredContent
    );
    expect(result.structuredContent).toEqual({
      rows: [{ email: 'private@example.test', password: 'private-password' }],
      sample: [{ access_token: 'private-sample-token' }],
      logs: ['Fetched one row using ***'],
      error: 'Request failed using ***',
    });
    expect(events).toHaveLength(1);
    const { [OFFLOAD_KEY]: offload, ...inline } = events[0].payload;
    expect(inline).toMatchObject({
      mcp_tool_status: 'error',
      error_type: 'ToolError',
      error_message: 'Request failed using ***',
    });
    expect(JSON.stringify(inline)).not.toContain('private');
    expect(JSON.stringify(events[0])).not.toContain('runtime-secret');
    expect(offload).toMatchObject({
      arguments: { connector_id: 'connector', node: 'items', configuration: '[REDACTED]' },
      result: {
        rows: [{ email: 'private@example.test', password: 'private-password' }],
        sample: [{ access_token: 'private-sample-token' }],
        logs: ['Fetched one row using ***'],
        error: 'Request failed using ***',
      },
    });
  });
});
