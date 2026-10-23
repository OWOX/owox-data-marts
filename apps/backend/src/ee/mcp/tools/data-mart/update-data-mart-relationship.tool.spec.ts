import { NotFoundException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type {
  McpDataMartRelationshipDto,
  McpDataMartRelationshipsFacade,
} from '../../../../data-marts/facades/mcp-data-mart-relationships.facade';
import { UpdateDataMartRelationshipTool } from './update-data-mart-relationship.tool';

describe('UpdateDataMartRelationshipTool', () => {
  const facade = { updateRelationship: jest.fn() };
  const tool = new UpdateDataMartRelationshipTool(
    facade as unknown as McpDataMartRelationshipsFacade
  );
  const input = { data_mart_id: 'source', relationship_id: 'relationship-1' };
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
    facade.updateRelationship.mockResolvedValue(relationship);
  });

  it('maps changes with the trusted project and actor and preserves masked references', async () => {
    const result = await tool.handler(
      {
        ...input,
        target_alias: 'orders',
        join_conditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
        description: 'Customer orders',
      },
      mcpContext
    );

    expect(facade.updateRelationship).toHaveBeenCalledWith({
      ...setupContext,
      dataMartId: 'source',
      relationshipId: 'relationship-1',
      targetAlias: 'orders',
      joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
      description: 'Customer orders',
    });
    expect(result.structuredContent).toEqual({ relationship });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual({ relationship });
  });

  it('keeps omitted fields undefined so existing values remain unchanged', async () => {
    await tool.handler(input, mcpContext);

    expect(facade.updateRelationship).toHaveBeenCalledWith({
      ...setupContext,
      dataMartId: 'source',
      relationshipId: 'relationship-1',
      targetAlias: undefined,
      joinConditions: undefined,
      description: undefined,
    });
  });

  it.each([null, '   '])('preserves explicit description %j for clearing', async description => {
    await tool.handler({ ...input, description }, mcpContext);

    expect(facade.updateRelationship).toHaveBeenCalledWith(
      expect.objectContaining({ description })
    );
  });

  it('permits draft relationships with no join conditions', async () => {
    await tool.handler({ ...input, join_conditions: [] }, mcpContext);

    expect(facade.updateRelationship).toHaveBeenCalledWith(
      expect.objectContaining({ joinConditions: [] })
    );
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
      expect(facade.updateRelationship).not.toHaveBeenCalled();
    }
  );

  it.each(['', 'Orders', 'order-items', 'orders.items', 'x'.repeat(256)])(
    'rejects invalid alias %s before mutation',
    async target_alias => {
      await expect(tool.handler({ ...input, target_alias }, mcpContext)).rejects.toThrow();
      expect(facade.updateRelationship).not.toHaveBeenCalled();
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
    expect(facade.updateRelationship).not.toHaveBeenCalled();
  });

  it.each([
    { data_mart_id: '' },
    { data_mart_id: undefined },
    { relationship_id: '' },
    { relationship_id: undefined },
  ])('requires source and relationship identifiers: %j', async invalid => {
    await expect(tool.handler({ ...input, ...invalid } as never, mcpContext)).rejects.toThrow();
    expect(facade.updateRelationship).not.toHaveBeenCalled();
  });

  it('propagates domain errors', async () => {
    const error = new NotFoundException('Resource not found in this project');
    facade.updateRelationship.mockRejectedValueOnce(error);

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
      destructiveHint: true,
      openWorldHint: false,
    });
  });
});
