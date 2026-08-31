import { z } from 'zod';
import type { McpReportsFacade } from '../../../data-marts/facades/mcp-reports.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { GetReportOutputSchemaTool } from './get-report-output-schema.tool';
import { McpToolRegistry } from './mcp-tool.registry';
import { MCP_TOOL_PROVIDER_CLASSES } from './mcp-tool.providers';

describe('GetReportOutputSchemaTool', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['viewer'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    authFlow: 'mcp',
  };

  const columns = [
    {
      name: 'date',
      title: 'Date',
      description: 'Reporting day',
      type: 'DATE',
      aggregateFunction: null,
      calculatedFieldLevel: null,
    },
    {
      name: 'revenue | SUM',
      title: 'Revenue, $ | SUM',
      description: null,
      type: 'NUMERIC',
      aggregateFunction: 'SUM',
      calculatedFieldLevel: null,
    },
    {
      name: 'ctr',
      title: 'CTR, %',
      description: null,
      type: 'FLOAT',
      aggregateFunction: null,
      calculatedFieldLevel: 'metric',
    },
  ];

  // The tool renames to snake_case at its edge; the two discriminators must survive that hop, or a
  // consumer cannot tell a non-additive metric from an ordinary numeric column.
  const snakeColumns = columns.map(column => ({
    name: column.name,
    title: column.title,
    description: column.description,
    type: column.type,
    aggregate_function: column.aggregateFunction,
    calculated_field_level: column.calculatedFieldLevel,
  }));

  it('returns the report columns using token project-member context', async () => {
    const facade = {
      getReportOutputSchema: jest.fn().mockResolvedValue({ reportId: 'report-1', columns }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new GetReportOutputSchemaTool(facade);

    const structuredContent = { report_id: 'report-1', columns: snakeColumns };

    await expect(tool.handler({ report_id: 'report-1' }, context)).resolves.toEqual({
      structuredContent,
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
    });
    expect(facade.getReportOutputSchema).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      reportId: 'report-1',
    });
  });

  // The SDK validates every structuredContent against this schema, so a hardcoded level vocabulary
  // would turn "a level was added to the domain" into an McpError from this tool. The level must
  // pass through as whatever the facade forwarded.
  it('accepts a calculated-field level the tool does not know about', () => {
    const tool = new GetReportOutputSchemaTool({} as McpReportsFacade);

    const parsed = z.object(tool.outputSchema).safeParse({
      report_id: 'report-1',
      columns: [
        {
          name: 'ctr',
          title: null,
          description: null,
          type: 'FLOAT',
          aggregate_function: null,
          calculated_field_level: 'a-level-added-later',
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects an input that names no report, or carries anything extra', () => {
    const tool = new GetReportOutputSchemaTool({} as McpReportsFacade);

    expect(() => tool.parseInput({})).toThrow();
    expect(() => tool.parseInput({ report_id: '' })).toThrow();
    expect(() => tool.parseInput({ report_id: 'report-1', limit: 10 })).toThrow();
    expect(tool.parseInput({ report_id: 'report-1' })).toEqual({ report_id: 'report-1' });
    // A padded id is what an LLM caller copying a value out of a previous answer produces; the
    // sibling report tools trim it, and a 404 here for whitespace alone would be gratuitous.
    expect(tool.parseInput({ report_id: '  report-1  ' })).toEqual({ report_id: 'report-1' });
    expect(() => tool.parseInput({ report_id: '   ' })).toThrow();
  });

  // Describing a report reads no report data and changes no OWOX entity, so a client holding only
  // `mcp:read` must be able to call it. The hint stays optimistic deliberately: a JOINED report on
  // a SQL-defined Data Mart still refreshes each source's technical view through the blending
  // decision, which the description warns about — unlike `query_data_mart`, which sets the hint to
  // false because every call costs credits and records a billable run.
  it('is registered as a read-only tool requiring only the read scope', () => {
    const registry = new McpToolRegistry([new GetReportOutputSchemaTool({} as McpReportsFacade)]);

    expect(new GetReportOutputSchemaTool({} as McpReportsFacade)).toMatchObject({
      name: 'get_report_output_schema',
      requiredScopes: ['mcp:read'],
      annotations: { readOnlyHint: true, destructiveHint: false },
    });
    expect(MCP_TOOL_PROVIDER_CLASSES.map(tool => tool.name)).toContain('GetReportOutputSchemaTool');
    expect(registry.getTool('get_report_output_schema')).toBeDefined();
  });
});
