import type { McpDataMartsFacade } from '../../../data-marts/facades/mcp-data-marts.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpToolRegistry } from './mcp-tool.registry';
import { ListDataMartsTool } from './data-mart-catalog.tool';
import { MCP_TOOL_PROVIDER_CLASSES } from './mcp-tool.providers';

describe('ListDataMartsTool', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['viewer'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    authFlow: 'mcp',
  };

  it('lists data marts using token project-member context', async () => {
    const facade = {
      listDataMarts: jest.fn().mockResolvedValue({
        dataMarts: [
          {
            id: 'dm_1',
            title: 'Orders',
            description: null,
            status: 'published',
            updatedAt: '2026-06-10T10:00:00.000Z',
          },
        ],
      }),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
    const tool = new ListDataMartsTool(facade);

    await expect(tool.handler({}, context)).resolves.toEqual({
      structuredContent: {
        data_marts: [
          {
            id: 'dm_1',
            title: 'Orders',
            description: '',
            status: 'published',
            updated_at: '2026-06-10T10:00:00.000Z',
          },
        ],
      },
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              data_marts: [
                {
                  id: 'dm_1',
                  title: 'Orders',
                  description: '',
                  status: 'published',
                  updated_at: '2026-06-10T10:00:00.000Z',
                },
              ],
            },
            null,
            2
          ),
        },
      ],
    });
    expect(facade.listDataMarts).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
    });
  });

  it('rejects explicit project_id input', async () => {
    const tool = new ListDataMartsTool({} as McpDataMartsFacade);

    expect(() => tool.parseInput({ project_id: 'another-project' })).toThrow();
  });

  it('registers list data marts while keeping unimplemented RFC tools out of providers', () => {
    const registry = new McpToolRegistry([new ListDataMartsTool({} as McpDataMartsFacade)]);

    expect(new ListDataMartsTool({} as McpDataMartsFacade)).toMatchObject({
      name: 'list_data_marts',
      requiredScopes: ['mcp:read'],
      outputSchema: expect.objectContaining({
        data_marts: expect.any(Object),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    });
    expect(MCP_TOOL_PROVIDER_CLASSES.map(tool => tool.name)).toEqual([
      'ListDataMartsTool',
      'GetProjectContextTool',
    ]);
    expect(registry.getTool('list_data_marts')).toBeDefined();
    expect(registry.getTool('query_data_mart')).toBeUndefined();
  });
});
