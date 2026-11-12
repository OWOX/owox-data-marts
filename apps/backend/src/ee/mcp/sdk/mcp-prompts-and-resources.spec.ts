import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpConfigService } from '../config/mcp.config';
import { MCP_GUIDES } from '../instructions/mcp-guides';
import { MCP_SERVER_GUIDE_URL } from '../tools/mcp-docs-urls';
import { McpToolRegistry } from '../tools/mcp-tool.registry';
import { McpSdkServerFactory } from './mcp-sdk-server.factory';

describe('MCP prompts and resources through the SDK', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['viewer'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    authFlow: 'mcp',
    integration: 'claude',
  };

  it('lists and reads the prompts and resources that the claude.ai menu shows', async () => {
    const recordRead = jest.fn();
    const server = new McpSdkServerFactory(
      new McpConfigService({ get: jest.fn() } as never),
      new McpToolRegistry([]),
      { wrap: jest.fn(), recordRead } as never
    ).create(context);
    const client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const { prompts } = await client.listPrompts();
      expect(prompts.map(p => p.title)).toEqual([
        'Explore my data',
        'Create a report',
        'Set up a Data Mart',
        'Check Data Mart runs',
      ]);
      for (const [name, topic] of [
        ['create_report', 'reporting'],
        ['set_up_data_mart', 'data_mart_setup'],
        ['check_data_mart_runs', 'data_mart_runs'],
      ] as const) {
        const prompt = await client.getPrompt({ name });
        expect(prompt.messages[0].content).toEqual({
          type: 'text',
          text: expect.stringContaining(MCP_GUIDES[topic]),
        });
        // The tool descriptions ask for the guide, so the prompt must say that it is already here.
        expect(prompt.messages[0].content).toMatchObject({
          text: expect.stringContaining(`do not call get_owox_guide({topic: "${topic}"})`),
        });
      }

      const { resources } = await client.listResources();
      expect(resources).toHaveLength(7);
      const read = await client.readResource({ uri: 'owox://guides/credentials' });
      expect(read.contents).toEqual([
        {
          uri: 'owox://guides/credentials',
          mimeType: 'text/markdown',
          text: MCP_GUIDES.credentials,
        },
      ]);

      const docs = await client.readResource({ uri: 'owox://docs/mcp' });
      expect(docs.contents).toEqual([
        {
          uri: 'owox://docs/mcp',
          mimeType: 'text/plain',
          text: expect.stringContaining(MCP_SERVER_GUIDE_URL),
        },
      ]);

      expect(recordRead.mock.calls).toEqual([
        ['prompts/get', 'create_report', expect.objectContaining({ mcpReq: expect.any(Object) })],
        ['prompts/get', 'set_up_data_mart', expect.any(Object)],
        ['prompts/get', 'check_data_mart_runs', expect.any(Object)],
        ['resources/read', 'owox://guides/credentials', expect.any(Object)],
        ['resources/read', 'owox://docs/mcp', expect.any(Object)],
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
