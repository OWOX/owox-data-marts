import type { PublicOriginService } from '../../../common/config/public-origin.service';
import type { McpDataMartsFacade } from '../../../data-marts/facades/mcp-data-marts.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { SummarizeDataCatalogTool } from './summarize-data-catalog.tool';

describe('SummarizeDataCatalogTool', () => {
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

  it('returns data catalog summary for the token project-member context', async () => {
    const facade = {
      summarizeDataCatalog: jest.fn().mockResolvedValue({
        projectId: 'project-1',
        dataMartCount: 1,
        topDataMartsByConnectivity: [
          {
            id: 'dm_1',
            title: 'Orders',
            description: 'Orders data mart',
            relationshipCount: 3,
            reportsCount: 2,
            triggersCount: 1,
            updatedAt: '2026-06-10T10:00:00.000Z',
          },
        ],
      }),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
    const tool = new SummarizeDataCatalogTool(facade, publicOrigin);

    await expect(tool.handler({}, context)).resolves.toEqual({
      structuredContent: {
        project_id: 'project-1',
        data_mart_count: 1,
        top_data_marts_by_connectivity: [
          {
            id: 'dm_1',
            title: 'Orders',
            description: 'Orders data mart',
            url: 'https://app.owox.com/ui/project-1/data-marts/dm_1/data-setup',
            relationship_count: 3,
            reports_count: 2,
            triggers_count: 1,
            updated_at: '2026-06-10T10:00:00.000Z',
          },
        ],
        _instruction:
          'You have received a high-level summary of the published Data Mart catalog available to this MCP connection. Summarize the business areas covered by the listed Data Marts and suggest 4-6 concrete example prompts the user could ask. Do not claim access to data rows, sample values, row counts, or freshness details.',
      },
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              project_id: 'project-1',
              data_mart_count: 1,
              top_data_marts_by_connectivity: [
                {
                  id: 'dm_1',
                  title: 'Orders',
                  description: 'Orders data mart',
                  url: 'https://app.owox.com/ui/project-1/data-marts/dm_1/data-setup',
                  relationship_count: 3,
                  reports_count: 2,
                  triggers_count: 1,
                  updated_at: '2026-06-10T10:00:00.000Z',
                },
              ],
              _instruction:
                'You have received a high-level summary of the published Data Mart catalog available to this MCP connection. Summarize the business areas covered by the listed Data Marts and suggest 4-6 concrete example prompts the user could ask. Do not claim access to data rows, sample values, row counts, or freshness details.',
            },
            null,
            2
          ),
        },
      ],
    });
    expect(facade.summarizeDataCatalog).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
    });
  });

  it('rejects explicit project input', () => {
    const tool = new SummarizeDataCatalogTool({} as McpDataMartsFacade, publicOrigin);

    expect(() => tool.parseInput({ project_id: 'another-project' })).toThrow();
  });

  it('describes read-only summary access without promising rows or freshness', () => {
    const tool = new SummarizeDataCatalogTool({} as McpDataMartsFacade, publicOrigin);

    expect(tool).toMatchObject({
      name: 'summarize_data_catalog',
      requiredScopes: ['mcp:read'],
      outputSchema: expect.objectContaining({
        project_id: expect.any(Object),
        data_mart_count: expect.any(Object),
        top_data_marts_by_connectivity: expect.any(Object),
        _instruction: expect.any(Object),
      }),
      annotations: {
        title: 'Summarize Data Catalog',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    });
    expect(tool.description).toContain('published Data Mart catalog');
    expect(tool.description).toContain('does not query actual data rows');
    expect(tool.description).toContain('compute data freshness');
  });
});
