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

  it('returns data mart details enriched with category/allowedAggregations and the operator matrix', async () => {
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
    const tool = new GetDataMartDetailsTool(facade);

    const result = await tool.handler({ data_mart_id: 'dm_1' }, context);
    const sc = result.structuredContent as {
      id: string;
      fields: Array<Record<string, unknown>>;
      joined_fields: Array<Record<string, unknown>>;
      operators_by_category: Record<string, string[]>;
    };

    expect(sc.id).toBe('dm_1');
    // Governance defaults, not the full type menu: DATE → MIN/MAX, STRING → COUNT/COUNT_DISTINCT.
    expect(sc.fields[0]).toMatchObject({
      name: 'order_date',
      type: 'DATE',
      category: 'date',
      allowedAggregations: ['MIN', 'MAX'],
    });
    expect(sc.fields[1]).toMatchObject({
      name: 'utm_source',
      category: 'string',
      allowedAggregations: ['COUNT', 'COUNT_DISTINCT'],
    });
    // Joined fields without a governance restriction get the same type-derived defaults.
    expect(sc.joined_fields[0]).toMatchObject({
      name: 'blended_org__orgName',
      sourceDataMart: 'blended_org',
      category: 'string',
      allowedAggregations: ['COUNT', 'COUNT_DISTINCT'],
    });
    // Only categories present in this data mart appear in the operator matrix.
    expect(Object.keys(sc.operators_by_category).sort()).toEqual(['date', 'string']);
    expect(sc.operators_by_category['string']).toEqual(
      expect.arrayContaining(['eq', 'contains', 'starts_with', 'is_null'])
    );
    expect(sc.operators_by_category['string']).not.toEqual(expect.arrayContaining(['gt']));
    expect(sc.operators_by_category['date']).toEqual(
      expect.arrayContaining(['before', 'after', 'between', 'in_last_n_days', 'this_month'])
    );

    expect(facade.getDataMartDetails).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      dataMartId: 'dm_1',
    });
  });

  it('narrows a field with an explicit allowedAggregations override and enriches nested fields', async () => {
    const facade = {
      getDataMartDetails: jest.fn().mockResolvedValue({
        id: 'dm_2',
        name: 'Events',
        description: '',
        fields: [
          {
            name: 'revenue',
            type: 'FLOAT',
            allowedAggregations: ['SUM', 'P95'],
          },
          {
            name: 'payload',
            type: 'RECORD',
            fields: [{ name: 'payload.amount', type: 'INTEGER' }],
          },
        ],
        joinedFields: [
          {
            name: 'costs__spend',
            type: 'FLOAT',
            description: '',
            sourceDataMart: 'costs',
            allowedAggregations: ['SUM'],
          },
          {
            name: 'costs__locked',
            type: 'FLOAT',
            description: '',
            sourceDataMart: 'costs',
            allowedAggregations: [],
          },
        ],
      }),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
    const tool = new GetDataMartDetailsTool(facade);

    const result = await tool.handler({ data_mart_id: 'dm_2' }, context);
    const sc = result.structuredContent as {
      fields: Array<Record<string, unknown>>;
      joined_fields: Array<Record<string, unknown>>;
      operators_by_category: Record<string, string[]>;
    };

    // Explicit override is preserved (already within the number menu).
    expect(sc.fields[0]).toMatchObject({ allowedAggregations: ['SUM', 'P95'] });
    // RECORD container is categorized 'other'; its nested leaf is enriched as a number.
    expect(sc.fields[1]).toMatchObject({ category: 'other', allowedAggregations: ['COUNT'] });
    expect((sc.fields[1].fields as Array<Record<string, unknown>>)[0]).toMatchObject({
      category: 'number',
      allowedAggregations: ['SUM', 'AVG', 'MIN', 'MAX'],
    });
    // Restricted joined field keeps its restriction.
    expect(sc.joined_fields[0]).toMatchObject({ allowedAggregations: ['SUM'] });
    // Explicit [] ("no aggregations allowed") must stay [], NOT fall back to type defaults —
    // the validator enforces the empty set, so advertising defaults would guarantee rejections.
    expect(sc.joined_fields[1]).toMatchObject({ allowedAggregations: [] });
    // 'other' category only allows null checks.
    expect(sc.operators_by_category['other']).toEqual(['is_null', 'is_not_null']);
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
        joined_fields: expect.any(Object),
        operators_by_category: expect.any(Object),
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
    expect(tool.description).toContain('allowedAggregations');
    expect(tool.description).toContain('operators_by_category');
    expect(tool.description).toContain('does not return data owners');
    expect(tool.description).toContain('data freshness');
    expect(tool.description).toContain('sample values');
    expect(tool.description).toContain('actual data rows');
  });
});
