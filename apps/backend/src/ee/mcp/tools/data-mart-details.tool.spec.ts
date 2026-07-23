import type { McpDataMartsFacade } from '../../../data-marts/facades/mcp-data-marts.facade';
import type { PublicOriginService } from '../../../common/config/public-origin.service';
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
  const publicOrigin = {
    getPublicOrigin: jest.fn(() => 'https://app.owox.com'),
  } as unknown as jest.Mocked<PublicOriginService>;

  it('returns data mart details using token project-member context', async () => {
    const detailsResult = {
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
      joinedFields: [
        {
          name: 'blended_org__orgName',
          type: 'STRING',
          description: 'Organization name',
          sourceDataMart: 'blended_org',
        },
      ],
    };
    const facade = {
      getDataMartDetails: jest.fn().mockResolvedValue(detailsResult),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
    const tool = new GetDataMartDetailsTool(facade, publicOrigin);

    const expectedStructured = {
      id: 'dm_1',
      name: 'Orders',
      url: 'https://app.owox.com/ui/project-1/data-marts/dm_1/data-setup',
      description: 'Orders data mart',
      fields: detailsResult.fields,
      joined_fields_included: true,
      joined_fields: detailsResult.joinedFields,
    };

    await expect(
      tool.handler({ data_mart_id: 'dm_1', detail_level: 'with_joined_fields' }, context)
    ).resolves.toEqual({
      structuredContent: expectedStructured,
      content: [
        {
          type: 'text',
          text: JSON.stringify(expectedStructured, null, 2),
        },
      ],
    });
    expect(facade.getDataMartDetails).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      dataMartId: 'dm_1',
      includeJoinedFields: true,
    });
  });

  it('defaults to native fields and marks joined fields as omitted', async () => {
    const facade = {
      getDataMartDetails: jest.fn().mockResolvedValue({
        id: 'dm_1',
        name: 'Orders',
        description: 'Orders data mart',
        fields: [],
        joinedFields: [],
      }),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
    const tool = new GetDataMartDetailsTool(facade, publicOrigin);

    const result = await tool.handler({ data_mart_id: 'dm_1' }, context);

    expect(result.structuredContent).toMatchObject({
      joined_fields_included: false,
      joined_fields: [],
    });
    expect(facade.getDataMartDetails).toHaveBeenCalledWith(
      expect.objectContaining({ includeJoinedFields: false })
    );
  });

  it('rejects explicit project_id and legacy camelCase dataMartId input', () => {
    const tool = new GetDataMartDetailsTool({} as McpDataMartsFacade, publicOrigin);

    expect(() => tool.parseInput({ data_mart_id: 'dm_1', project_id: 'project-2' })).toThrow();
    expect(() => tool.parseInput({ dataMartId: 'dm_1' })).toThrow();
  });

  it('describes details lookup as read-only metadata access', () => {
    const tool = new GetDataMartDetailsTool({} as McpDataMartsFacade, publicOrigin);

    expect(tool).toMatchObject({
      name: 'get_data_mart_details_by_id',
      requiredScopes: ['mcp:read'],
      outputSchema: expect.objectContaining({
        id: expect.any(Object),
        name: expect.any(Object),
        url: expect.any(Object),
        description: expect.any(Object),
        fields: expect.any(Object),
        joined_fields_included: expect.any(Object),
        joined_fields: expect.any(Object),
      }),
      annotations: {
        title: 'Get Data Mart Details',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    });
    expect(tool.description).toContain('Get available details');
    expect(tool.description).toContain('joined_fields');
    expect(tool.description).toContain('get_relevant_data_marts_by_prompt');
    expect(tool.description).toContain('field-level metadata');
    expect(tool.description).toContain('does not return data owners');
    expect(tool.description).toContain('data freshness');
    expect(tool.description).toContain('sample values');
    expect(tool.description).toContain('actual data rows');
  });
});
