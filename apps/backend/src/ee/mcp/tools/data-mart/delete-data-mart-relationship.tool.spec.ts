import { NotFoundException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type { McpDataMartRelationshipsFacade } from '../../../../data-marts/facades/mcp-data-mart-relationships.facade';
import { DeleteDataMartRelationshipTool } from './delete-data-mart-relationship.tool';

describe('DeleteDataMartRelationshipTool', () => {
  const facade = { deleteRelationship: jest.fn() };
  const tool = new DeleteDataMartRelationshipTool(
    facade as unknown as McpDataMartRelationshipsFacade
  );
  const input = { data_mart_id: 'source', relationship_id: 'relationship-1' };

  beforeEach(() => {
    jest.resetAllMocks();
    facade.deleteRelationship.mockResolvedValue(undefined);
  });

  it('deletes only the relationship identified under the source Data Mart with the trusted actor', async () => {
    const result = await tool.handler(input, mcpContext);

    expect(facade.deleteRelationship).toHaveBeenCalledWith({
      ...setupContext,
      dataMartId: 'source',
      relationshipId: 'relationship-1',
    });
    expect(result.structuredContent).toEqual({
      relationship_id: 'relationship-1',
      status: 'deleted',
    });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual({
      relationship_id: 'relationship-1',
      status: 'deleted',
    });
  });

  it.each([
    { project_id: 'foreign-project' },
    { projectId: 'foreign-project' },
    { user_id: 'other-user' },
    { userId: 'other-user' },
    { roles: ['admin'] },
  ])('rejects untrusted context override %j before mutation', async override => {
    await expect(tool.handler({ ...input, ...override } as never, mcpContext)).rejects.toThrow();
    expect(facade.deleteRelationship).not.toHaveBeenCalled();
  });

  it.each([
    { data_mart_id: '' },
    { data_mart_id: undefined },
    { relationship_id: '' },
    { relationship_id: undefined },
  ])('requires source and relationship identifiers: %j', async invalid => {
    await expect(tool.handler({ ...input, ...invalid } as never, mcpContext)).rejects.toThrow();
    expect(facade.deleteRelationship).not.toHaveBeenCalled();
  });

  it('propagates domain errors', async () => {
    const error = new NotFoundException('Resource not found in this project');
    facade.deleteRelationship.mockRejectedValueOnce(error);

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
