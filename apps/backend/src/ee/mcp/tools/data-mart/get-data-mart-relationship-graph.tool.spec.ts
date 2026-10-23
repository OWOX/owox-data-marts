import { NotFoundException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type {
  McpDataMartRelationshipDto,
  McpDataMartRelationshipsFacade,
} from '../../../../data-marts/facades/mcp-data-mart-relationships.facade';
import { GetDataMartRelationshipGraphTool } from './get-data-mart-relationship-graph.tool';

describe('GetDataMartRelationshipGraphTool', () => {
  const facade = { getRelationshipGraph: jest.fn() };
  const tool = new GetDataMartRelationshipGraphTool(
    facade as unknown as McpDataMartRelationshipsFacade
  );
  const input = { data_mart_id: 'source' };
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
    facade.getRelationshipGraph.mockResolvedValue({ rootDataMartId: 'source', nodes: [] });
  });

  it('maps the graph root to snake_case with trusted context and keeps inaccessible metadata absent', async () => {
    const nodes = [
      { relationship, aliasPath: 'orders', depth: 1, isCycleStub: false, isBlocked: true },
    ];
    facade.getRelationshipGraph.mockResolvedValue({ rootDataMartId: 'source', nodes });

    const result = await tool.handler(input, mcpContext);

    expect(facade.getRelationshipGraph).toHaveBeenCalledWith({
      ...setupContext,
      dataMartId: 'source',
    });
    expect(result.structuredContent).toEqual({ root_data_mart_id: 'source', nodes });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual({
      root_data_mart_id: 'source',
      nodes,
    });
  });

  it('returns an empty graph without inventing relationship nodes', async () => {
    const result = await tool.handler(input, mcpContext);

    expect(result.structuredContent).toEqual({ root_data_mart_id: 'source', nodes: [] });
  });

  it.each([
    { project_id: 'foreign-project' },
    { projectId: 'foreign-project' },
    { user_id: 'other-user' },
    { userId: 'other-user' },
    { roles: ['admin'] },
  ])('rejects untrusted context override %j before discovery', async override => {
    await expect(tool.handler({ ...input, ...override } as never, mcpContext)).rejects.toThrow();
    expect(facade.getRelationshipGraph).not.toHaveBeenCalled();
  });

  it.each([{ data_mart_id: '' }, {}])('requires a root Data Mart identifier: %j', async invalid => {
    await expect(tool.handler(invalid as never, mcpContext)).rejects.toThrow();
    expect(facade.getRelationshipGraph).not.toHaveBeenCalled();
  });

  it('propagates domain errors', async () => {
    const error = new NotFoundException('Resource not found in this project');
    facade.getRelationshipGraph.mockRejectedValueOnce(error);

    await expect(tool.handler(input, mcpContext)).rejects.toBe(error);
  });

  it('advertises serializable raw shapes with read access', () => {
    const inputJson = z.toJSONSchema(z.object(tool.zodSchema), { io: 'input' });
    const outputJson = z.toJSONSchema(z.object(tool.outputSchema));

    expect(inputJson.properties).toHaveProperty('data_mart_id');
    expect(inputJson.properties).not.toHaveProperty('project_id');
    expect(outputJson.type).toBe('object');
    expect(tool.requiredScopes).toEqual(['mcp:read']);
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
  });
});
