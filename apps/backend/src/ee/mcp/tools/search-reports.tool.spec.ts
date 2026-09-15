import type { SearchFacade } from '../../../common/search/search.facade';
import { SearchableEntityType } from '../../../common/search/search.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { SearchReportsTool } from './search-reports.tool';

describe('SearchReportsTool', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['viewer'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    authFlow: 'mcp',
  };
  const projectContext = {
    getProjectContext: jest.fn().mockResolvedValue({
      project: { id: 'project-1', title: 'Analytics' },
    }),
  };
  const reportResult = {
    entityType: SearchableEntityType.REPORT,
    entityId: 'rep-1',
    title: 'Monthly revenue',
    description: null,
    finalScore: 91,
    kwScore: 74,
    vecScore: 83,
    report: {
      dataMart: { id: 'dm-1', title: 'Orders' },
      dataDestination: { id: 'dd-1', title: 'Finance Sheets', type: 'GOOGLE_SHEETS' },
    },
    url: 'https://app.owox.com/ui/project-1/data-marts/dm-1/reports?reportId=rep-1',
  };

  function toolWith(results: unknown[]) {
    const facade = {
      search: jest.fn().mockResolvedValue(results),
    } as unknown as jest.Mocked<SearchFacade>;
    return { facade, tool: new SearchReportsTool(facade, projectContext as never) };
  }

  it('searches reports visible to the MCP project member and returns typed references', async () => {
    const { facade, tool } = toolWith([reportResult]);

    const result = await tool.handler({ prompt: 'monthly revenue', limit: 5 }, context);

    expect(result.structuredContent).toEqual({
      project: { id: 'project-1', title: 'Analytics' },
      reports: [
        {
          report_id: 'rep-1',
          title: 'Monthly revenue',
          data_mart: { id: 'dm-1', title: 'Orders' },
          destination: { id: 'dd-1', title: 'Finance Sheets', type: 'google_sheets' },
          relevance_score: 91,
          url: 'https://app.owox.com/ui/project-1/data-marts/dm-1/reports?reportId=rep-1',
        },
      ],
    });
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify(result.structuredContent, null, 2) },
    ]);
    expect(facade.search).toHaveBeenCalledWith('project-1', 'monthly revenue', {
      topK: 5,
      entityTypes: [SearchableEntityType.REPORT],
      accessScope: { userId: 'user-1', roles: ['viewer'] },
    });
  });

  it('uses a conservative default result limit', async () => {
    const { facade, tool } = toolWith([]);

    await tool.handler({ prompt: 'revenue' }, context);

    expect(facade.search).toHaveBeenCalledWith(
      'project-1',
      'revenue',
      expect.objectContaining({ topK: 10 })
    );
  });

  it('drops results that are not reports with references and a direct URL', async () => {
    const { tool } = toolWith([
      { ...reportResult, entityType: SearchableEntityType.DATA_MART },
      { ...reportResult, entityId: 'rep-2', report: undefined },
      { ...reportResult, entityId: 'rep-3', url: undefined },
    ]);

    const result = await tool.handler({ prompt: 'revenue' }, context);

    expect(result.structuredContent).toEqual({
      project: { id: 'project-1', title: 'Analytics' },
      reports: [],
    });
  });

  it('returns results when optional project metadata is unavailable', async () => {
    const facade = {
      search: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<SearchFacade>;
    const unavailableProjectContext = {
      getProjectContext: jest.fn().mockRejectedValue(new Error('Project context unavailable')),
    };
    const tool = new SearchReportsTool(facade, unavailableProjectContext as never);

    const result = await tool.handler({ prompt: 'revenue' }, context);

    expect(result.structuredContent).toEqual({ reports: [] });
  });

  it('rejects unknown input fields, short prompts, and too-wide limits', () => {
    const { tool } = toolWith([]);

    expect(() => tool.parseInput({ prompt: 'revenue', project_id: 'another' })).toThrow();
    expect(() => tool.parseInput({ prompt: 'r' })).toThrow();
    expect(() => tool.parseInput({ prompt: 'revenue', limit: 100 })).toThrow();
    expect(tool.parseInput({ prompt: ' revenue ' })).toEqual({ prompt: 'revenue' });
  });

  it('describes itself as a read-only report discovery tool', () => {
    const { tool } = toolWith([]);

    expect(tool).toMatchObject({
      name: 'get_relevant_reports_by_prompt',
      requiredScopes: ['mcp:read'],
      outputSchema: expect.objectContaining({
        project: expect.any(Object),
        reports: expect.any(Object),
      }),
      annotations: {
        title: 'Find Relevant Reports by Prompt',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    });
    expect(tool.description).toContain('report');
    expect(tool.description).toContain('get_data_mart_reports');
  });
});
