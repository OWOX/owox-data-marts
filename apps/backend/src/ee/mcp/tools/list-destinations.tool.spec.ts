import type { McpDataDestinationsFacade } from '../../../data-marts/facades/mcp-data-destinations.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { McpToolRegistry } from './mcp-tool.registry';
import { ListDestinationsTool } from './list-destinations.tool';
import { MCP_TOOL_PROVIDER_CLASSES } from './mcp-tool.providers';

describe('ListDestinationsTool', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['viewer'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    authFlow: 'mcp',
  };

  it('lists destinations using token project-member context', async () => {
    const facade = {
      listDestinations: jest.fn().mockResolvedValue({
        destinations: [
          { id: 'dest_1', name: 'Marketing Sheet', type: 'google_sheets', owner: 'ann@owox.com' },
        ],
      }),
    } as unknown as jest.Mocked<McpDataDestinationsFacade>;
    const tool = new ListDestinationsTool(facade);

    const structuredContent = {
      destinations: [
        { id: 'dest_1', name: 'Marketing Sheet', type: 'google_sheets', owner: 'ann@owox.com' },
      ],
    };

    await expect(tool.handler({}, context)).resolves.toEqual({
      structuredContent,
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredContent, null, 2),
        },
      ],
    });
    expect(facade.listDestinations).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
    });
  });

  it('rejects unexpected input', () => {
    const tool = new ListDestinationsTool({} as McpDataDestinationsFacade);

    expect(() => tool.parseInput({ project_id: 'another-project' })).toThrow();
  });

  it('is registered with read-only metadata and the right scope', () => {
    const registry = new McpToolRegistry([
      new ListDestinationsTool({} as McpDataDestinationsFacade),
    ]);

    expect(new ListDestinationsTool({} as McpDataDestinationsFacade)).toMatchObject({
      name: 'list_destinations',
      requiredScopes: ['mcp:read'],
      outputSchema: expect.objectContaining({
        destinations: expect.any(Object),
      }),
      annotations: {
        title: 'List Destinations',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    });
    expect(MCP_TOOL_PROVIDER_CLASSES.map(tool => tool.name)).toContain('ListDestinationsTool');
    expect(registry.getTool('list_destinations')).toBeDefined();
  });
});
