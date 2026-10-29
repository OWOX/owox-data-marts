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
  parameters: {
    Value: { attributes: ['SECRET'], default: 'sensitive-content', label: 'Credential' },
  },
  nodes: { items: { request: { path: '/items' } } },
};
const loggedManifest = {
  ...manifest,
  parameters: { Value: { ...manifest.parameters.Value, default: '[REDACTED]' } },
};
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
      }),
      activate: jest.fn().mockResolvedValue({ activeVersionId: 'version-id', activeVersion: 1 }),
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

  it('maps test configuration and MCP limit names to the domain request', async () => {
    const client = await open();
    await client.callTool({
      name: 'test_custom_connector',
      arguments: {
        manifest,
        node: 'items',
        configuration: { Value: 'sensitive-content' },
        max_rows: 2,
        max_pages: 3,
      },
    });
    expect(facade.test).toHaveBeenCalledWith('project-1', {
      manifest,
      node: 'items',
      configuration: { Value: 'sensitive-content' },
      maxRows: 2,
      maxPages: 3,
    });
    expect(events[0].payload[OFFLOAD_KEY]?.arguments).toMatchObject({
      manifest: loggedManifest,
      configuration: { Value: '[REDACTED]' },
      max_rows: 2,
      max_pages: 3,
    });
  });

  it.each([
    ['save_custom_connector_draft', { connector_id: 'connector', manifest }, 'arguments'],
    ['get_custom_connector_version', { connector_id: 'connector', version: 1 }, 'result'],
  ] as const)(
    '%s masks telemetry without changing the authoring payload',
    async (name, args, surface) => {
      const client = await open();
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).not.toBe(true);
      expect(events[0].payload[OFFLOAD_KEY]?.[surface]).toMatchObject({ manifest: loggedManifest });
      expect(JSON.stringify(events[0])).not.toContain('sensitive-content');
      expect(manifest.parameters.Value.default).toBe('sensitive-content');
      if (name === 'get_custom_connector_version') {
        expect(result.structuredContent).toMatchObject({ manifest });
      } else {
        expect(facade.saveDraft).toHaveBeenCalledWith('project-1', 'connector', manifest);
      }
    }
  );

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

  it('bounds the test log trail while retaining final diagnostics, rows and raw sample', async () => {
    const client = await open();
    const diagnostic = 'This test ran only node items; another node cannot be published.';
    const logs = [
      ...Array.from({ length: 80 }, (_, i) => `Request ${i}: ${'x'.repeat(300)}`),
      diagnostic,
    ];
    const raw = { rows: [{ id: 1 }], sample: [{ id: 1, extra: 'raw value' }], logs, error: null };
    facade.test.mockResolvedValue(raw);
    const result = await client.callTool({
      name: 'test_custom_connector',
      arguments: { manifest, node: 'items', configuration: {} },
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
      { manifest, node: 'items', configuration: { pad: 'x'.repeat(120 * 1024) } },
    ],
    ['test_custom_connector', { manifest, node: 'items', configuration: {}, max_rows: 1001 }],
    ['test_custom_connector', { manifest, node: 'items', configuration: {}, max_pages: 51 }],
    ['test_custom_connector', { manifest, node: 'items', configuration: {}, max_pages: 1.5 }],
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

  it('reports a failed test without copying partial upstream data into inline telemetry', async () => {
    const client = await open();
    facade.test.mockResolvedValue({
      rows: [{ email: 'private@example.test', password: 'private-password' }],
      logs: ['Fetched one row using ***'],
      error: 'Request failed using ***',
      sample: [{ access_token: 'private-sample-token' }],
    });
    const result = await client.callTool({
      name: 'test_custom_connector',
      arguments: { manifest, node: 'items', configuration: { Value: 'runtime-secret' } },
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
      arguments: { configuration: { Value: '[REDACTED]' }, manifest: loggedManifest },
      result: {
        rows: [{ email: 'private@example.test', password: '[REDACTED]' }],
        sample: [{ access_token: '[REDACTED]' }],
        logs: ['Fetched one row using ***'],
        error: 'Request failed using ***',
      },
    });
  });
});
