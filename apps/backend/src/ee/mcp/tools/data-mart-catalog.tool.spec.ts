import { z } from 'zod';
import type { PublicOriginService } from '../../../common/config/public-origin.service';
import { DataMartStatus } from '../../../data-marts/enums/data-mart-status.enum';
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
  const projectContext = {
    getProjectContext: jest.fn().mockResolvedValue({
      project: { id: 'project-1', title: 'Analytics' },
    }),
  };

  it('lists data marts using token project-member context', async () => {
    const facade = {
      listDataMarts: jest.fn().mockResolvedValue({
        dataMarts: [
          {
            id: 'dm_1',
            title: 'Orders',
            description: null,
            status: DataMartStatus.PUBLISHED,
            updatedAt: '2026-06-10T10:00:00.000Z',
          },
        ],
      }),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
    const tool = new ListDataMartsTool(facade, publicOrigin, projectContext as never);

    await expect(tool.handler({}, context)).resolves.toEqual({
      structuredContent: {
        project: { id: 'project-1', title: 'Analytics' },
        data_marts: [
          {
            id: 'dm_1',
            title: 'Orders',
            description: '',
            url: 'https://app.owox.com/ui/project-1/data-marts/dm_1/data-setup',
            status: DataMartStatus.PUBLISHED,
            updated_at: '2026-06-10T10:00:00.000Z',
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
                  status: DataMartStatus.PUBLISHED,
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
      status: 'published',
    });
  });

  it('lists draft data marts only when explicitly requested', async () => {
    const facade = {
      listDataMarts: jest.fn().mockResolvedValue({
        dataMarts: [
          {
            id: 'dm_draft',
            title: 'Draft Orders',
            description: 'Unpublished changes',
            status: 'DRAFT',
            updatedAt: '2026-06-11T10:00:00.000Z',
          },
        ],
      }),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
    const tool = new ListDataMartsTool(facade, publicOrigin, projectContext as never);

    const result = await tool.handler({ status: 'draft' }, context);

    expect(facade.listDataMarts).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      status: 'draft',
    });
    expect(result.structuredContent).toEqual({
      project: { id: 'project-1', title: 'Analytics' },
      data_marts: [
        {
          id: 'dm_draft',
          title: 'Draft Orders',
          description: 'Unpublished changes',
          url: 'https://app.owox.com/ui/project-1/data-marts/dm_draft/data-setup',
          status: 'DRAFT',
          updated_at: '2026-06-11T10:00:00.000Z',
        },
      ],
    });
  });

  it('rejects explicit project_id input', async () => {
    const tool = new ListDataMartsTool(
      {} as McpDataMartsFacade,
      publicOrigin,
      projectContext as never
    );

    expect(() => tool.parseInput({ project_id: 'another-project' })).toThrow();
  });

  it('rejects an unsupported catalog state', () => {
    const tool = new ListDataMartsTool(
      {} as McpDataMartsFacade,
      publicOrigin,
      projectContext as never
    );

    expect(() => tool.parseInput({ status: 'archived' })).toThrow();
  });

  it('returns the catalog when optional project metadata is unavailable', async () => {
    const facade = {
      listDataMarts: jest.fn().mockResolvedValue({ dataMarts: [] }),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
    const unavailableProjectContext = {
      getProjectContext: jest.fn().mockRejectedValue(new Error('Project context unavailable')),
    };
    const tool = new ListDataMartsTool(facade, publicOrigin, unavailableProjectContext as never);

    const result = await tool.handler({}, context);

    expect(result.structuredContent).toEqual({
      data_marts: [],
      getting_started: expect.objectContaining({ reason: 'no_published_data_marts' }),
    });
  });

  it('guides the user when the published catalog is empty, naming visible drafts', async () => {
    const facade = {
      listDataMarts: jest.fn(async ({ status }: { status: string }) => ({
        dataMarts:
          status === 'draft'
            ? [
                {
                  id: 'dm_draft',
                  title: 'Draft Orders',
                  description: null,
                  status: DataMartStatus.DRAFT,
                  updatedAt: '2026-06-11T10:00:00.000Z',
                },
              ]
            : [],
      })),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
    const tool = new ListDataMartsTool(facade, publicOrigin, projectContext as never);

    const result = await tool.handler({}, context);

    expect(result.structuredContent).toEqual({
      project: { id: 'project-1', title: 'Analytics' },
      data_marts: [],
      getting_started: expect.objectContaining({
        reason: 'no_published_data_marts',
        can_create_data_marts: false,
        create_data_mart_url: 'https://app.owox.com/ui/project-1/data-marts/create',
        draft_data_marts: [
          {
            id: 'dm_draft',
            title: 'Draft Orders',
            url: 'https://app.owox.com/ui/project-1/data-marts/dm_draft/data-setup',
          },
        ],
      }),
    });
    expect(facade.listDataMarts).toHaveBeenCalledTimes(2);
    // The SDK validates structuredContent against outputSchema at call time, so a key required by
    // gettingStartedSchema but missing from buildGettingStarted would fail every empty project.
    expect(() => z.object(tool.outputSchema).parse(result.structuredContent)).not.toThrow();
  });

  it('guides on an empty draft list when no published data mart exists either', async () => {
    const facade = {
      listDataMarts: jest.fn().mockResolvedValue({ dataMarts: [] }),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
    const tool = new ListDataMartsTool(facade, publicOrigin, projectContext as never);

    const result = await tool.handler({ status: 'draft' }, context);

    expect(result.structuredContent).toEqual({
      project: { id: 'project-1', title: 'Analytics' },
      data_marts: [],
      getting_started: expect.objectContaining({
        reason: 'no_published_data_marts',
        draft_data_marts: [],
      }),
    });
    const statuses = facade.listDataMarts.mock.calls.map(([request]) => request.status);
    expect(statuses).toEqual(['draft', 'published', 'draft']);
  });

  it('does not guide on an empty draft list while a published data mart exists', async () => {
    const facade = {
      listDataMarts: jest.fn(async ({ status }: { status: string }) => ({
        dataMarts:
          status === 'published'
            ? [
                {
                  id: 'dm_1',
                  title: 'Orders',
                  description: null,
                  status: DataMartStatus.PUBLISHED,
                  updatedAt: '2026-06-10T10:00:00.000Z',
                },
              ]
            : [],
      })),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
    const tool = new ListDataMartsTool(facade, publicOrigin, projectContext as never);

    const result = await tool.handler({ status: 'draft' }, context);

    expect(result.structuredContent).toEqual({
      project: { id: 'project-1', title: 'Analytics' },
      data_marts: [],
    });
  });

  // Note: MCP_TOOL_PROVIDER_CLASSES assertion checks the LOCAL test registry snapshot, not
  // production gating. QueryDataMartTool IS in providers; the registry fixture here only
  // registers ListDataMartsTool so query_data_mart is absent from that local registry.
  it('registers list_data_marts and verifies provider class list', () => {
    const registry = new McpToolRegistry([
      new ListDataMartsTool({} as McpDataMartsFacade, publicOrigin, projectContext as never),
    ]);

    expect(
      new ListDataMartsTool({} as McpDataMartsFacade, publicOrigin, projectContext as never)
    ).toMatchObject({
      name: 'list_data_marts',
      requiredScopes: ['mcp:read'],
      outputSchema: expect.objectContaining({
        project: expect.any(Object),
        data_marts: expect.any(Object),
        getting_started: expect.any(Object),
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
      'GetReportOutputSchemaTool',
      'ListReportRunSchedulesTool',
      'CreateReportRunScheduleTool',
      'UpdateReportRunScheduleTool',
      'DeleteReportRunScheduleTool',
      'QueryDataMartTool',
      'AddReportTool',
      'UpdateReportTool',
      'DeleteReportTool',
      'AddDestinationTool',
      'RunReportTool',
      'GetReportRunStatusTool',
    ]);
    expect(registry.getTool('list_data_marts')).toBeDefined();
    expect(registry.getTool('query_data_mart')).toBeUndefined();
  });
});
