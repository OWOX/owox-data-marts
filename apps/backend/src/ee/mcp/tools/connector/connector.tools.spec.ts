import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { ConfigService } from '@nestjs/config';
import { adminMcpContext } from '../../../../../test/fixtures/mcp-auth-context';
import type { McpConnectorsFacade } from '../../../../data-marts/facades/mcp-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { McpConfigService } from '../../config/mcp.config';
import { McpCallInstrumentation } from '../../observability/mcp-call-instrumentation';
import { McpSdkServerFactory } from '../../sdk/mcp-sdk-server.factory';
import { McpToolRegistry } from '../mcp-tool.registry';
import { ListConnectorsTool } from './list-connectors.tool';
import { GetConnectorSpecificationTool } from './get-connector-specification.tool';
import { GetConnectorFieldsTool } from './get-connector-fields.tool';
import { PreviewConnectorFieldsTool } from './preview-connector-fields.tool';
import { PreviewConnectorFieldOptionsTool } from './preview-connector-field-options.tool';

describe('connector tools through MCP SDK', () => {
  let facade: jest.Mocked<McpConnectorsFacade>;
  const closers: Array<() => Promise<void>> = [];
  async function open(context: McpAuthContext = adminMcpContext) {
    const factory = new McpSdkServerFactory(
      new McpConfigService(new ConfigService()),
      new McpToolRegistry([
        new ListConnectorsTool(facade),
        new GetConnectorSpecificationTool(facade),
        new GetConnectorFieldsTool(facade),
        new PreviewConnectorFieldsTool(facade),
        new PreviewConnectorFieldOptionsTool(facade),
      ]),
      new McpCallInstrumentation(
        { publishExternalSafely: () => {} } as never,
        { get: () => undefined, set: () => {} } as never
      )
    );
    const server = factory.create(context);
    const client = new Client({ name: 'connector-contract', version: '1' });
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
    facade = {
      list: jest.fn().mockResolvedValue([
        {
          name: 'GoogleSheets',
          title: 'Google Sheets',
          description: null,
          docUrl: 'https://docs.example/sheets',
        },
      ]),
      getSpecification: jest
        .fn()
        .mockResolvedValue([{ name: 'SheetName', requiredType: 'string' }]),
      getFields: jest
        .fn()
        .mockResolvedValue([{ name: 'sheet', fields: [{ name: 'id', type: 'string' }] }]),
      previewFields: jest.fn().mockResolvedValue([{ name: 'sheet', fields: [{ name: 'id' }] }]),
      previewFieldOptions: jest.fn().mockResolvedValue([{ value: 'Sheet1', label: 'Sheet 1' }]),
    };
  });
  afterEach(async () => {
    await Promise.all(closers.splice(0).map(close => close()));
  });

  it('publishes all five tools with strict schemas and returns discovery DTOs', async () => {
    const client = await open();
    const tools = (await client.listTools()).tools;
    expect(tools.map(tool => tool.name)).toEqual([
      'list_connectors',
      'get_connector_specification',
      'get_connector_fields',
      'preview_connector_fields',
      'preview_connector_field_options',
    ]);
    expect(tools.every(tool => tool.inputSchema.additionalProperties === false)).toBe(true);
    expect(
      (await client.callTool({ name: 'list_connectors', arguments: {} })).structuredContent
    ).toEqual({
      connectors: [
        {
          name: 'GoogleSheets',
          title: 'Google Sheets',
          description: null,
          doc_url: 'https://docs.example/sheets',
        },
      ],
    });
    expect(
      (
        await client.callTool({
          name: 'get_connector_specification',
          arguments: { connector_name: 'GoogleSheets' },
        })
      ).structuredContent
    ).toEqual({ specification: [{ name: 'SheetName', requiredType: 'string' }] });
    expect(
      (
        await client.callTool({
          name: 'get_connector_fields',
          arguments: { connector_name: 'GoogleSheets' },
        })
      ).structuredContent
    ).toEqual({ fields: [{ name: 'sheet', fields: [{ name: 'id', type: 'string' }] }] });
  });

  it('passes connected actor and explicit Credential ID to preview facade', async () => {
    const client = await open();
    const arguments_ = {
      connector_name: 'GoogleSheets',
      credential_id: 'saved',
      configuration: { SpreadsheetId: 'sheet' },
      data_mart_id: 'bound-dm',
      configuration_id: 'saved-config',
    };
    await client.callTool({ name: 'preview_connector_fields', arguments: arguments_ });
    expect(facade.previewFields).toHaveBeenCalledWith(
      { projectId: 'project-1', userId: 'user-1', roles: ['admin'] },
      {
        connectorName: 'GoogleSheets',
        credentialId: 'saved',
        configuration: { SpreadsheetId: 'sheet' },
        dataMartId: 'bound-dm',
        configurationId: 'saved-config',
      }
    );
    expect(
      (
        await client.callTool({
          name: 'preview_connector_field_options',
          arguments: { ...arguments_, field: 'SheetName' },
        })
      ).structuredContent
    ).toEqual({ options: [{ value: 'Sheet1', label: 'Sheet 1' }] });
  });

  it.each([
    ['list_connectors', { token: 'raw-secret' }],
    ['get_connector_specification', { connector_name: 'GoogleSheets', token: 'raw-secret' }],
    ['get_connector_fields', { connector_name: 'GoogleSheets', password: 'raw-secret' }],
    [
      'preview_connector_fields',
      { connector_name: 'GoogleSheets', configuration: {}, token: 'raw-secret' },
    ],
    [
      'preview_connector_field_options',
      {
        connector_name: 'GoogleSheets',
        field: 'SheetName',
        configuration: {},
        _secrets_id: 'legacy',
      },
    ],
  ])('rejects unexpected secret-bearing input for %s at SDK boundary', async (name, arguments_) => {
    const client = await open();
    const result = await client.callTool({ name: name as string, arguments: arguments_ });
    expect(result.isError).toBe(true);
    expect(Object.values(facade).every(method => method.mock.calls.length === 0)).toBe(true);
  });

  it.each([
    { ...adminMcpContext, roles: ['viewer'] },
    { ...adminMcpContext, scopes: ['mcp:read'] },
  ] as McpAuthContext[])(
    'blocks live probes without editor role and write scope',
    async context => {
      const client = await open(context);
      const result = await client.callTool({
        name: 'preview_connector_fields',
        arguments: { connector_name: 'GoogleSheets', configuration: {} },
      });
      expect(result.isError).toBe(true);
      expect(facade.previewFields).not.toHaveBeenCalled();
    }
  );
});
