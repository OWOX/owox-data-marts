import type { McpDataDestinationsFacade } from '../../../../data-marts/facades/mcp-data-destinations.facade';
import type { PublicOriginService } from '../../../../common/config/public-origin.service';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { McpToolRegistry } from '../mcp-tool.registry';
import { ListDestinationsTool } from './list-destinations.tool';
import { MCP_TOOL_PROVIDER_CLASSES } from '../mcp-tool.providers';
import { OwnerFilter } from '../../../../data-marts/enums/owner-filter.enum';

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
  const publicOrigin = {
    getPublicOrigin: jest.fn(() => 'https://app.owox.com'),
  } as unknown as jest.Mocked<PublicOriginService>;

  it('lists destinations using token project-member context', async () => {
    const facade = {
      listDestinations: jest.fn().mockResolvedValue({
        destinations: [
          {
            id: 'dest_1',
            name: 'Marketing Sheet',
            type: 'google_sheets',
            owner: 'ann@owox.com',
            connectedGoogleAccount: null,
            createdAt: '2026-01-01T00:00:00Z',
            owners: [],
            contexts: [],
            availableForUse: false,
            availableForMaintenance: false,
            credential: null,
          },
        ],
      }),
    } as unknown as jest.Mocked<McpDataDestinationsFacade>;
    const tool = new ListDestinationsTool(facade, publicOrigin);

    const structuredContent = {
      destinations: [
        {
          id: 'dest_1',
          name: 'Marketing Sheet',
          type: 'google_sheets',
          owner: 'ann@owox.com',
          connectedGoogleAccount: null,
          createdAt: '2026-01-01T00:00:00Z',
          owners: [],
          contexts: [],
          available_for_use: false,
          available_for_maintenance: false,
          credential: null,
          url: 'https://app.owox.com/ui/project-1/data-destinations?id=dest_1',
        },
      ],
    };

    const result = await tool.handler({}, context);
    expect(result.structuredContent).toEqual(structuredContent);
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(structuredContent);
    expect(facade.listDestinations).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
    });
  });

  it('rejects unexpected input', () => {
    const tool = new ListDestinationsTool({} as McpDataDestinationsFacade, publicOrigin);

    expect(() => tool.parseInput({ project_id: 'another-project' })).toThrow();
  });

  it('passes type and owner filters through a full strict schema', async () => {
    const facade = { listDestinations: jest.fn().mockResolvedValue({ destinations: [] }) };
    const tool = new ListDestinationsTool(facade as never, publicOrigin);
    await tool.handler(
      { destination_type: 'email', owner_id: 'owner', owner_filter: OwnerFilter.HAS_OWNERS },
      context
    );
    expect(facade.listDestinations).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      type: 'email',
      ownerId: 'owner',
      ownerFilter: 'has_owners',
    });
    expect('parse' in tool.zodSchema).toBe(true);
  });

  it('is registered with read-only metadata and the right scope', () => {
    const registry = new McpToolRegistry([
      new ListDestinationsTool({} as McpDataDestinationsFacade, publicOrigin),
    ]);

    expect(new ListDestinationsTool({} as McpDataDestinationsFacade, publicOrigin)).toMatchObject({
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
