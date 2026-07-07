import type { PublicOriginService } from '../../../common/config/public-origin.service';
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
  const publicOrigin = {
    getPublicOrigin: jest.fn(() => 'https://app.owox.com'),
  } as unknown as jest.Mocked<PublicOriginService>;

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
    const tool = new ListDataMartsTool(facade, publicOrigin);

    await expect(tool.handler({}, context)).resolves.toEqual({
      structuredContent: {
        data_marts: [
          {
            id: 'dm_1',
            title: 'Orders',
            description: '',
            url: 'https://app.owox.com/ui/project-1/data-marts/dm_1/data-setup',
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
                  url: 'https://app.owox.com/ui/project-1/data-marts/dm_1/data-setup',
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
    const tool = new ListDataMartsTool({} as McpDataMartsFacade, publicOrigin);

    expect(() => tool.parseInput({ project_id: 'another-project' })).toThrow();
  });

  // Note: MCP_TOOL_PROVIDER_CLASSES assertion checks the LOCAL test registry snapshot, not
  // production gating. QueryDataMartTool IS in providers; the registry fixture here only
  // registers ListDataMartsTool so query_data_mart is absent from that local registry.
  it('registers list_data_marts and verifies provider class list', () => {
    const registry = new McpToolRegistry([
      new ListDataMartsTool({} as McpDataMartsFacade, publicOrigin),
    ]);

    expect(new ListDataMartsTool({} as McpDataMartsFacade, publicOrigin)).toMatchObject({
      name: 'list_data_marts',
      requiredScopes: ['mcp:read'],
      outputSchema: expect.objectContaining({
        data_marts: expect.any(Object),
      }),
      annotations: {
        title: 'List Data Marts',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    });
    expect(MCP_TOOL_PROVIDER_CLASSES.map(tool => tool.name)).toEqual([
      'SummarizeDataCatalogTool',
      'ListDataMartsTool',
      'SearchDataMartsTool',
      'GetDataMartDetailsTool',
      'GetProjectContextTool',
      'ListDestinationsTool',
      'GetDataMartReportsTool',
      'ListReportRunSchedulesTool',
      'CreateReportRunScheduleTool',
      'UpdateReportRunScheduleTool',
      'DeleteReportRunScheduleTool',
      'QueryDataMartTool',
      'AddReportTool',
      'UpdateReportTool',
      'DeleteReportTool',
    ]);
    expect(registry.getTool('list_data_marts')).toBeDefined();
    expect(registry.getTool('query_data_mart')).toBeUndefined();
  });
});
