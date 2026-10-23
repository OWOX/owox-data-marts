import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, type JsonSchemaType } from '@modelcontextprotocol/server';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import type { McpConnectorsFacade } from '../../../data-marts/facades/mcp-connectors.facade';
import { mcpContext, setupContext } from '../../../../test/fixtures/mcp-configuration';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpConfigService } from '../config/mcp.config';
import {
  connectorConfiguration,
  connectorNodes,
  connectorSpecification,
  connectorSummary,
  sourceDataMartId,
} from '../tools/connector/connector-tool.fixtures';
import { GetConnectorFieldsTool } from '../tools/connector/get-connector-fields.tool';
import { GetConnectorSpecificationTool } from '../tools/connector/get-connector-specification.tool';
import { ListConnectorConfigurationsTool } from '../tools/connector/list-connector-configurations.tool';
import { ListConnectorsTool } from '../tools/connector/list-connectors.tool';
import { PreviewConnectorFieldOptionsTool } from '../tools/connector/preview-connector-field-options.tool';
import { PreviewConnectorFieldsTool } from '../tools/connector/preview-connector-fields.tool';
import { McpToolRegistry } from '../tools/mcp-tool.registry';
import { McpSdkServerFactory } from './mcp-sdk-server.factory';

const specification = [
  ...connectorSpecification,
  { name: 'DynamicTable', requiredType: 'string' as const, attributes: ['DYNAMIC_FIELDS'] },
];
const options = [{ value: 'account-1', label: 'Основний обліковий запис' }];
const previewArguments = {
  connector_name: 'CustomOrders',
  configuration: { AccountId: 'account-2', Settings: { useSandbox: true } },
  source_data_mart_id: sourceDataMartId,
  source_configuration_id: 'configuration-1',
};
const previewInput = {
  connectorName: 'CustomOrders',
  configuration: { AccountId: 'account-2', Settings: { useSandbox: true } },
  sourceDataMartId,
  sourceConfigurationId: 'configuration-1',
};
const toolCases = [
  {
    name: 'list_connectors',
    method: 'listConnectors',
    arguments: {},
    expected: {
      connectors: [
        {
          id: 'connector-1',
          name: 'CustomOrders',
          title: 'Замовлення',
          description: 'Orders from a project connector',
          doc_url: 'https://docs.example.test/orders',
          is_custom: true,
          active_version: 3,
          capabilities: { singleConfiguration: false, copySecretsByValue: true },
        },
      ],
    },
  },
  {
    name: 'get_connector_specification',
    method: 'getConnectorSpecification',
    arguments: { connector_name: 'CustomOrders', version: 3 },
    input: { connectorName: 'CustomOrders', version: 3 },
    expected: { specification },
  },
  {
    name: 'get_connector_fields',
    method: 'getConnectorFields',
    arguments: { connector_name: 'CustomOrders', version: 3 },
    input: { connectorName: 'CustomOrders', version: 3 },
    expected: { nodes: connectorNodes },
  },
  {
    name: 'list_connector_configurations',
    method: 'listConnectorConfigurations',
    arguments: { connector_name: 'CustomOrders' },
    input: { connectorName: 'CustomOrders' },
    expected: {
      configurations: [
        {
          data_mart_id: sourceDataMartId,
          data_mart_title: 'Замовлення',
          configuration_id: 'configuration-1',
          connector_name: 'CustomOrders',
          version: 3,
          configuration: {
            SecretKey: '********',
            AccountId: 'account-1',
            Settings: { useSandbox: false, includeTags: ['new'] },
          },
        },
      ],
    },
  },
  {
    name: 'preview_connector_fields',
    method: 'previewConnectorFields',
    arguments: previewArguments,
    input: previewInput,
    expected: { nodes: connectorNodes },
  },
  {
    name: 'preview_connector_field_options',
    method: 'previewConnectorFieldOptions',
    arguments: { ...previewArguments, field: 'AccountId' },
    input: { ...previewInput, field: 'AccountId' },
    expected: { options },
  },
] satisfies Array<{
  name: string;
  method: keyof McpConnectorsFacade;
  arguments: Record<string, unknown>;
  input?: Record<string, unknown>;
  expected: Record<string, unknown>;
}>;

describe('MCP connector contracts over the SDK', () => {
  let facade: jest.Mocked<McpConnectorsFacade>;
  let client: Client;
  let server: ReturnType<McpSdkServerFactory['create']>;

  const connect = async (context: McpAuthContext = mcpContext) => {
    const factory = new McpSdkServerFactory(
      new McpConfigService(new ConfigService()),
      new McpToolRegistry([
        new ListConnectorsTool(facade),
        new GetConnectorSpecificationTool(facade),
        new GetConnectorFieldsTool(facade),
        new ListConnectorConfigurationsTool(facade),
        new PreviewConnectorFieldsTool(facade),
        new PreviewConnectorFieldOptionsTool(facade),
      ]),
      { wrap: (_name: string, callback: unknown) => callback } as never
    );
    server = factory.create(context);
    client = new Client({ name: 'connector-contract-test', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  };

  beforeEach(() => {
    facade = {
      listConnectors: jest.fn().mockResolvedValue([connectorSummary]),
      getConnectorSpecification: jest.fn().mockResolvedValue(specification),
      getConnectorFields: jest.fn().mockResolvedValue(connectorNodes),
      listConnectorConfigurations: jest.fn().mockResolvedValue([connectorConfiguration]),
      previewConnectorFields: jest.fn().mockResolvedValue(connectorNodes),
      previewConnectorFieldOptions: jest.fn().mockResolvedValue(options),
    };
  });

  afterEach(async () => {
    await client?.close();
    await server?.close();
  });

  it.each(toolCases)(
    'advertises usable schemas and returns connector metadata without renaming nested API keys for $name',
    async testCase => {
      await connect();
      const catalog = await client.listTools();
      const advertised = catalog.tools.find(tool => tool.name === testCase.name);
      if (!advertised?.outputSchema) throw new Error(`Missing schema for ${testCase.name}`);
      expect(advertised.description).toEqual(expect.any(String));
      expect(advertised.outputSchema).toMatchObject({
        required: expect.arrayContaining(['next_steps']),
        properties: { next_steps: { type: 'array', items: { type: 'string' } } },
      });
      const validator = new AjvJsonSchemaValidator();
      const validateInput = validator.getValidator(advertised.inputSchema as JsonSchemaType);
      expect(validateInput(testCase.arguments).valid).toBe(true);

      const result = await client.callTool({
        name: testCase.name,
        arguments: testCase.arguments,
      });

      expect(result.isError).not.toBe(true);
      const validateOutput = validator.getValidator(advertised.outputSchema as JsonSchemaType);
      expect(validateOutput(result.structuredContent).valid).toBe(true);
      const structuredContent = result.structuredContent as Record<string, unknown>;
      expect(structuredContent).toEqual({
        ...testCase.expected,
        next_steps: expect.arrayContaining([expect.any(String)]),
      });
      if (testCase.name === 'list_connector_configurations') {
        expect(structuredContent.next_steps).toEqual(
          expect.arrayContaining([
            expect.stringContaining('source_data_mart_id'),
            expect.stringContaining('source_configuration_id'),
          ])
        );
      }
      const expectedArguments =
        'input' in testCase ? [setupContext, testCase.input] : [setupContext];
      expect(facade[testCase.method]).toHaveBeenCalledWith(...expectedArguments);
    }
  );

  it('guides an empty configuration list through draft creation and authenticated UI setup before rereading', async () => {
    facade.listConnectorConfigurations.mockResolvedValue([]);
    await connect();

    const result = await client.callTool({
      name: 'list_connector_configurations',
      arguments: { connector_name: 'CustomOrders' },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      configurations: [],
      next_steps: expect.arrayContaining([
        expect.stringContaining('create_data_mart'),
        expect.stringContaining('setup_url'),
        expect.stringMatching(/authenticat/i),
        expect.stringMatching(/save/i),
        expect.stringContaining('list_connector_configurations'),
      ]),
    });
  });

  it.each([
    { name: 'preview_connector_fields', method: 'previewConnectorFields', extra: {} },
    {
      name: 'preview_connector_field_options',
      method: 'previewConnectorFieldOptions',
      extra: { field: 'AccountId' },
    },
  ] as const)(
    'rejects unpaired source IDs and blank configuration IDs before $name reaches the facade',
    async testCase => {
      await connect();
      for (const source of [
        { source_data_mart_id: sourceDataMartId },
        { source_configuration_id: 'configuration-1' },
        { source_data_mart_id: sourceDataMartId, source_configuration_id: ' ' },
      ]) {
        const result = await client.callTool({
          name: testCase.name,
          arguments: { connector_name: 'CustomOrders', ...testCase.extra, ...source },
        });
        expect(result.isError).toBe(true);
      }
      expect(facade[testCase.method]).not.toHaveBeenCalled();
    }
  );

  it('returns a source-access failure as an SDK tool error', async () => {
    facade.previewConnectorFieldOptions.mockRejectedValue(
      new ForbiddenException('Cannot use source Data Mart')
    );
    await connect();

    const result = await client.callTool({
      name: 'preview_connector_field_options',
      arguments: { ...previewArguments, field: 'AccountId' },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContainEqual({
      type: 'text',
      text: expect.stringContaining('Cannot use source Data Mart'),
    });
  });

  it('requires the read scope before any connector tool reaches the facade', async () => {
    await connect({ ...mcpContext, scopes: ['mcp:write'] });
    for (const testCase of toolCases) {
      const result = await client.callTool({
        name: testCase.name,
        arguments: testCase.arguments,
      });
      expect(result.isError).toBe(true);
      expect(result.content).toContainEqual({
        type: 'text',
        text: expect.stringContaining('Missing MCP scope: mcp:read'),
      });
      expect(facade[testCase.method]).not.toHaveBeenCalled();
    }
  });
});
