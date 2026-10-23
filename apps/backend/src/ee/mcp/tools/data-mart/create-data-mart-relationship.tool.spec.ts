import { NotFoundException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type {
  McpDataMartRelationshipDto,
  McpDataMartRelationshipsFacade,
} from '../../../../data-marts/facades/mcp-data-mart-relationships.facade';
import { CreateDataMartRelationshipTool } from './create-data-mart-relationship.tool';

describe('CreateDataMartRelationshipTool', () => {
  const facade = { createRelationship: jest.fn() };
  const tool = new CreateDataMartRelationshipTool(
    facade as unknown as McpDataMartRelationshipsFacade
  );
  const input = {
    data_mart_id: 'source',
    target_data_mart_id: 'target',
    target_alias: 'orders',
    join_conditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
  };
  const relationship: McpDataMartRelationshipDto = {
    id: 'relationship-1',
    dataStorageId: 'storage-1',
    sourceDataMart: { id: 'source', userHasAccess: true, title: 'Customers' },
    targetDataMart: { id: 'target', userHasAccess: false },
    targetAlias: 'orders',
    joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
    createdById: 'creator',
    createdAt: '2026-10-01T00:00:00.000Z',
    modifiedAt: '2026-10-02T00:00:00.000Z',
    createdByUser: null,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    facade.createRelationship.mockResolvedValue(relationship);
  });

  it('maps the relationship with the trusted project and actor and preserves masked references', async () => {
    const result = await tool.handler({ ...input, description: 'Customer orders' }, mcpContext);

    expect(facade.createRelationship).toHaveBeenCalledWith({
      ...setupContext,
      dataMartId: 'source',
      targetDataMartId: 'target',
      targetAlias: 'orders',
      joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
      description: 'Customer orders',
    });
    expect(result.structuredContent).toEqual({ relationship });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual({ relationship });
  });

  it('permits draft relationships with no join conditions', async () => {
    await tool.handler({ ...input, join_conditions: [] }, mcpContext);

    expect(facade.createRelationship).toHaveBeenCalledWith(
      expect.objectContaining({ joinConditions: [] })
    );
  });

  it('preserves an omitted description and rejects null before mutation', async () => {
    expect(tool.parseInput(input)).not.toHaveProperty('description');
    await expect(
      tool.handler({ ...input, description: null } as never, mcpContext)
    ).rejects.toThrow();
    expect(facade.createRelationship).not.toHaveBeenCalled();
  });

  it.each(['sourceFieldName', 'targetFieldName'])(
    'rejects a dotted %s before mutation',
    async field => {
      await expect(
        tool.handler(
          {
            ...input,
            join_conditions: [
              { sourceFieldName: 'id', targetFieldName: 'id', [field]: 'address.id' },
            ],
          },
          mcpContext
        )
      ).rejects.toThrow();
      expect(facade.createRelationship).not.toHaveBeenCalled();
    }
  );

  it.each(['', 'Orders', 'order-items', 'orders.items', 'x'.repeat(256)])(
    'rejects invalid alias %s before mutation',
    async target_alias => {
      await expect(tool.handler({ ...input, target_alias }, mcpContext)).rejects.toThrow();
      expect(facade.createRelationship).not.toHaveBeenCalled();
    }
  );

  it.each([
    { project_id: 'foreign-project' },
    { projectId: 'foreign-project' },
    { user_id: 'other-user' },
    { userId: 'other-user' },
    { roles: ['admin'] },
  ])('rejects untrusted context override %j before mutation', async override => {
    await expect(tool.handler({ ...input, ...override } as never, mcpContext)).rejects.toThrow();
    expect(facade.createRelationship).not.toHaveBeenCalled();
  });

  it.each([
    { data_mart_id: '' },
    { data_mart_id: undefined },
    { target_data_mart_id: '' },
    { target_data_mart_id: undefined },
  ])('requires both Data Mart identifiers: %j', async invalid => {
    await expect(tool.handler({ ...input, ...invalid } as never, mcpContext)).rejects.toThrow();
    expect(facade.createRelationship).not.toHaveBeenCalled();
  });

  it('propagates domain errors', async () => {
    const error = new NotFoundException('Resource not found in this project');
    facade.createRelationship.mockRejectedValueOnce(error);

    await expect(tool.handler(input, mcpContext)).rejects.toBe(error);
  });

  it('advertises serializable raw shapes with write access', () => {
    const inputJson = z.toJSONSchema(z.object(tool.zodSchema), { io: 'input' });
    const outputJson = z.toJSONSchema(z.object(tool.outputSchema));

    expect(inputJson.properties).toHaveProperty('data_mart_id');
    expect(inputJson.properties).not.toHaveProperty('project_id');
    expect(outputJson.type).toBe('object');
    expect(tool.requiredScopes).toEqual(['mcp:write']);
    expect(tool.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    });
  });
});
