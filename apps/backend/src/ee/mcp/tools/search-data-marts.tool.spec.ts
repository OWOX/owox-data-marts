import type { PublicOriginService } from '../../../common/config/public-origin.service';
import type { SearchFacade } from '../../../common/search/search.facade';
import { SearchableEntityType } from '../../../common/search/search.facade';
import type { McpDataMartsFacade } from '../../../data-marts/facades/mcp-data-marts.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { SearchDataMartsTool } from './search-data-marts.tool';

describe('SearchDataMartsTool', () => {
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
  const projectContext = {
    getProjectContext: jest.fn().mockResolvedValue({
      project: { id: 'project-1', title: 'Analytics' },
    }),
  };
  const publishedDataMart = {
    id: 'dm_1',
    title: 'Orders',
    description: null,
    status: 'PUBLISHED',
    updatedAt: '2026-06-10T10:00:00.000Z',
  };
  function catalogWith(published: unknown[]) {
    return {
      listDataMarts: jest.fn(async ({ status }: { status: string }) => ({
        dataMarts: status === 'published' ? published : [],
      })),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
  }
  const catalog = catalogWith([publishedDataMart]);

  it('searches only non-draft data marts visible to the MCP project member', async () => {
    const facade = {
      search: jest.fn().mockResolvedValue([
        {
          entityType: SearchableEntityType.DATA_MART,
          entityId: 'dm_1',
          title: 'Orders',
          description: null,
          finalScore: 91,
          kwScore: 74,
          vecScore: 83,
        },
      ]),
    } as unknown as jest.Mocked<SearchFacade>;
    const tool = new SearchDataMartsTool(facade, publicOrigin, projectContext as never, catalog);

    await expect(tool.handler({ prompt: 'orders revenue', limit: 5 }, context)).resolves.toEqual({
      structuredContent: {
        project: { id: 'project-1', title: 'Analytics' },
        data_marts: [
          {
            id: 'dm_1',
            title: 'Orders',
            description: '',
            url: 'https://app.owox.com/ui/project-1/data-marts/dm_1/data-setup',
            relevance_score: 91,
          },
        ],
      },
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              project: { id: 'project-1', title: 'Analytics' },
              data_marts: [
                {
                  id: 'dm_1',
                  title: 'Orders',
                  description: '',
                  url: 'https://app.owox.com/ui/project-1/data-marts/dm_1/data-setup',
                  relevance_score: 91,
                },
              ],
            },
            null,
            2
          ),
        },
      ],
    });
    expect(facade.search).toHaveBeenCalledWith('project-1', 'orders revenue', {
      topK: 5,
      entityTypes: [SearchableEntityType.DATA_MART],
      excludeDrafts: true,
      accessScope: {
        userId: 'user-1',
        roles: ['viewer'],
      },
    });
  });

  it('uses a conservative default result limit', async () => {
    const facade = {
      search: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<SearchFacade>;
    const tool = new SearchDataMartsTool(facade, publicOrigin, projectContext as never, catalog);

    await tool.handler({ prompt: 'orders' }, context);

    expect(facade.search).toHaveBeenCalledWith(
      'project-1',
      'orders',
      expect.objectContaining({ topK: 10 })
    );
  });

  it('returns search results when optional project metadata is unavailable', async () => {
    const facade = {
      search: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<SearchFacade>;
    const unavailableProjectContext = {
      getProjectContext: jest.fn().mockRejectedValue(new Error('Project context unavailable')),
    };
    const tool = new SearchDataMartsTool(
      facade,
      publicOrigin,
      unavailableProjectContext as never,
      catalog
    );

    const result = await tool.handler({ prompt: 'orders' }, context);

    expect(result.structuredContent).toEqual({ data_marts: [] });
  });

  it('does not guide when nothing matched but a published data mart exists', async () => {
    const facade = {
      search: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<SearchFacade>;
    const tool = new SearchDataMartsTool(facade, publicOrigin, projectContext as never, catalog);

    const result = await tool.handler({ prompt: 'orders' }, context);

    expect(result.structuredContent).toEqual({
      project: { id: 'project-1', title: 'Analytics' },
      data_marts: [],
    });
  });

  it('does not touch the catalog when the search found something', async () => {
    const facade = {
      search: jest.fn().mockResolvedValue([
        {
          entityType: SearchableEntityType.DATA_MART,
          entityId: 'dm_1',
          title: 'Orders',
          description: null,
          finalScore: 91,
          kwScore: 74,
          vecScore: 83,
        },
      ]),
    } as unknown as jest.Mocked<SearchFacade>;
    const untouched = catalogWith([]);
    const tool = new SearchDataMartsTool(facade, publicOrigin, projectContext as never, untouched);

    await tool.handler({ prompt: 'orders' }, context);

    expect(untouched.listDataMarts).not.toHaveBeenCalled();
  });

  it('guides the user when the project has no published data mart', async () => {
    const facade = {
      search: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<SearchFacade>;
    const empty = catalogWith([]);
    const tool = new SearchDataMartsTool(facade, publicOrigin, projectContext as never, empty);

    const result = await tool.handler({ prompt: 'orders' }, context);

    expect(result.structuredContent).toEqual({
      project: { id: 'project-1', title: 'Analytics' },
      data_marts: [],
      getting_started: expect.objectContaining({
        reason: 'no_published_data_marts',
        can_create_data_marts: false,
        create_data_mart_url: 'https://app.owox.com/ui/project-1/data-marts/create',
        data_marts_url: 'https://app.owox.com/ui/project-1/data-marts',
        draft_data_marts: [],
      }),
    });
  });

  it('rejects explicit project_id, legacy query, and too-wide limits', () => {
    const tool = new SearchDataMartsTool(
      {} as SearchFacade,
      publicOrigin,
      projectContext as never,
      catalog
    );

    expect(() => tool.parseInput({ prompt: 'orders', project_id: 'another-project' })).toThrow();
    expect(() => tool.parseInput({ query: 'orders' })).toThrow();
    expect(() => tool.parseInput({ prompt: 'orders', limit: 100 })).toThrow();
  });

  it('describes that it only searches non-draft data marts', () => {
    const tool = new SearchDataMartsTool(
      {} as SearchFacade,
      publicOrigin,
      projectContext as never,
      catalog
    );

    expect(tool).toMatchObject({
      name: 'get_relevant_data_marts_by_prompt',
      requiredScopes: ['mcp:read'],
      outputSchema: expect.objectContaining({
        project: expect.any(Object),
        data_marts: expect.any(Object),
        getting_started: expect.any(Object),
      }),
      annotations: {
        title: 'Find Relevant Data Marts by Prompt',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    });
    expect(tool.description).toContain('non-draft data marts');
    expect(tool.description).toContain('current OWOX project');
    expect(tool.description).toContain('not data storages or destinations');
  });
});
