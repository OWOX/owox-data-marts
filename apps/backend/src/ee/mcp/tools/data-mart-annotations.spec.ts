import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { ConfigService } from '@nestjs/config';
import { adminMcpContext } from '../../../../test/fixtures/mcp-auth-context';
import { McpConfigService } from '../config/mcp.config';
import { McpCallInstrumentation } from '../observability/mcp-call-instrumentation';
import { McpSdkServerFactory } from '../sdk/mcp-sdk-server.factory';
import { McpToolRegistry } from './mcp-tool.registry';
import { GetDataMartSetupTool } from './data-mart/get-data-mart-setup.tool';
import { ValidateDataMartTool } from './data-mart/validate-data-mart.tool';
import { PublishDataMartTool } from './data-mart/publish-data-mart.tool';
import { UpdateDataMartDefinitionTool } from './data-mart/update-data-mart-definition.tool';
import { PreviewDataMartTool } from './data-mart-model/preview-data-mart.tool';
import { UpdateDataMartRunScheduleTool } from './data-mart-execution/update-data-mart-run-schedule.tool';

describe('Data Mart side-effect annotations through MCP SDK', () => {
  const factory = new McpSdkServerFactory(
    new McpConfigService(new ConfigService()),
    new McpToolRegistry([
      new GetDataMartSetupTool({} as never, {} as never),
      new ValidateDataMartTool({} as never),
      new PublishDataMartTool({} as never, {} as never),
      new UpdateDataMartDefinitionTool({} as never, {} as never),
      new PreviewDataMartTool({} as never),
      new UpdateDataMartRunScheduleTool({} as never),
    ]),
    new McpCallInstrumentation(
      { publishExternalSafely: () => {} } as never,
      { get: () => undefined, set: () => {} } as never
    )
  );
  const server = factory.create(adminMcpContext);
  const client = new Client({ name: 'data-mart-annotation-contract', version: '1' });

  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  it.each([
    ['validate_data_mart', { readOnlyHint: false, destructiveHint: true, openWorldHint: true }],
    ['publish_data_mart', { readOnlyHint: false, destructiveHint: true, openWorldHint: true }],
    ['preview_data_mart', { readOnlyHint: false, destructiveHint: true, openWorldHint: true }],
  ])('warns clients that %s can replace warehouse resources', async (name, annotations) => {
    const listed = (await client.listTools()).tools.find(tool => tool.name === name);
    expect(listed?.annotations).toMatchObject(annotations);
  });

  it.each(['update_data_mart_definition', 'update_data_mart_run_schedule'])(
    'does not advertise automatic retries as harmless for %s',
    async name => {
      const listed = (await client.listTools()).tools.find(tool => tool.name === name);
      expect(listed?.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false });
    }
  );

  it('advertises stored setup as a read without external synchronization', async () => {
    const listed = (await client.listTools()).tools.find(
      tool => tool.name === 'get_data_mart_setup'
    );
    expect(listed?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
  });
});
