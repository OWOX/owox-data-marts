import type { PublicOriginService } from '../../../common/config/public-origin.service';
import type { SearchFacade } from '../../../common/search/search.facade';
import { SearchableEntityType } from '../../../common/search/search.facade';
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
    const tool = new SearchDataMartsTool(facade, publicOrigin);

    await expect(tool.handler({ prompt: 'orders revenue', limit: 5 }, context)).resolves.toEqual({
      structuredContent: {
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
    const tool = new SearchDataMartsTool(facade, publicOrigin);

    await tool.handler({ prompt: 'orders' }, context);

    expect(facade.search).toHaveBeenCalledWith(
      'project-1',
      'orders',
      expect.objectContaining({ topK: 10 })
    );
  });

  it('rejects explicit project_id, legacy query, and too-wide limits', () => {
    const tool = new SearchDataMartsTool({} as SearchFacade, publicOrigin);

    expect(() => tool.parseInput({ prompt: 'orders', project_id: 'another-project' })).toThrow();
    expect(() => tool.parseInput({ query: 'orders' })).toThrow();
    expect(() => tool.parseInput({ prompt: 'orders', limit: 100 })).toThrow();
  });

  it('describes that it only searches non-draft data marts', () => {
    const tool = new SearchDataMartsTool({} as SearchFacade, publicOrigin);

    expect(tool).toMatchObject({
      name: 'get_relevant_data_marts_by_prompt',
      requiredScopes: ['mcp:read'],
      outputSchema: expect.objectContaining({
        data_marts: expect.any(Object),
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
