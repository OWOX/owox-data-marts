import type { McpDataMartsFacade } from '../../../data-marts/facades/mcp-data-marts.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { GetDataMartDetailsTool } from './data-mart-details.tool';

describe('GetDataMartDetailsTool', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['viewer'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    authFlow: 'mcp',
  };

  it('returns data mart details using token project-member context', async () => {
    const facade = {
      getDataMartDetails: jest.fn().mockResolvedValue({
        id: 'dm_1',
        name: 'Orders',
        description: 'Orders data mart',
        fields: [
          {
            name: 'order_date',
            type: 'DATE',
            description: 'Order date',
          },
          {
            name: 'utm_source',
            type: 'STRING',
            businessName: 'Traffic source',
            description: 'Marketing traffic source',
          },
        ],
      }),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
    const tool = new GetDataMartDetailsTool(facade);

    await expect(tool.handler({ data_mart_id: 'dm_1' }, context)).resolves.toEqual({
      structuredContent: {
        id: 'dm_1',
        name: 'Orders',
        description: 'Orders data mart',
        fields: [
          {
            name: 'order_date',
            type: 'DATE',
            description: 'Order date',
          },
          {
            name: 'utm_source',
            type: 'STRING',
            businessName: 'Traffic source',
            description: 'Marketing traffic source',
          },
        ],
      },
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              id: 'dm_1',
              name: 'Orders',
              description: 'Orders data mart',
              fields: [
                {
                  name: 'order_date',
                  type: 'DATE',
                  description: 'Order date',
                },
                {
                  name: 'utm_source',
                  type: 'STRING',
                  businessName: 'Traffic source',
                  description: 'Marketing traffic source',
                },
              ],
            },
            null,
            2
          ),
        },
      ],
    });
    expect(facade.getDataMartDetails).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      dataMartId: 'dm_1',
    });
  });

  it('rejects explicit project_id and legacy camelCase dataMartId input', () => {
    const tool = new GetDataMartDetailsTool({} as McpDataMartsFacade);

    expect(() => tool.parseInput({ data_mart_id: 'dm_1', project_id: 'project-2' })).toThrow();
    expect(() => tool.parseInput({ dataMartId: 'dm_1' })).toThrow();
  });

  it('describes details lookup as read-only metadata access', () => {
    const tool = new GetDataMartDetailsTool({} as McpDataMartsFacade);

    expect(tool).toMatchObject({
      name: 'get_data_mart_details_by_id',
      requiredScopes: ['mcp:read'],
      outputSchema: expect.objectContaining({
        id: expect.any(Object),
        name: expect.any(Object),
        description: expect.any(Object),
        fields: expect.any(Object),
      }),
      annotations: {
        title: 'Get Data Mart Details',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    });
    expect(tool.description).toContain('full output schema');
    expect(tool.description).toContain('Includes sample values for categorical fields');
    expect(tool.description).toContain('Call before every query_data_mart');
  });
});
