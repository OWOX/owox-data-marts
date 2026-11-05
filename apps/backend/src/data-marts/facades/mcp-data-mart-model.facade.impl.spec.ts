jest.mock('typeorm-transactional', () => ({ Transactional: () => () => undefined }));
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { McpDataMartModelFacadeImpl } from './mcp-data-mart-model.facade.impl';
import { McpDataMartModelMapper } from '../mappers/mcp-data-mart-model.mapper';

const actor: AuthorizationContext = { projectId: 'project', userId: 'user', roles: ['editor'] };
const relationship = {
  id: 'relationship',
  dataStorageId: 'storage',
  targetAlias: 'orders',
  sourceDataMart: {
    id: 'source',
    title: 'Source',
    status: 'DRAFT',
    userHasAccess: true,
    hasPrimaryKey: true,
  },
  targetDataMart: {
    id: 'target',
    title: 'Target',
    status: 'PUBLISHED',
    userHasAccess: true,
    hasPrimaryKey: false,
  },
  joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'source_id', private: 'never' }],
  description: 'Orders per source',
  createdById: 'private-user',
  createdByUser: { email: 'never' },
  createdAt: new Date('2026-11-05T00:00:00Z'),
  modifiedAt: new Date('2026-11-05T00:00:00Z'),
  private: 'never',
};
function fixture() {
  const graph = {
    run: jest.fn().mockResolvedValue({
      rootDataMartId: 'source',
      nodes: [{ relationship, aliasPath: 'orders', depth: 1, isCycleStub: false, isBlocked: true }],
    }),
  };
  const create = { run: jest.fn().mockResolvedValue(relationship) };
  const update = { run: jest.fn().mockResolvedValue(relationship) };
  const remove = { run: jest.fn().mockResolvedValue(undefined) };
  const preview = {
    run: jest.fn().mockResolvedValue({
      columns: [{ name: 'id', type: 'INT64', private: 'never' }],
      rows: [[1]],
      rowCount: 1,
      limit: 20,
      truncated: false,
      sql: 'never',
    }),
  };
  const facade = new McpDataMartModelFacadeImpl(
    graph as never,
    create as never,
    update as never,
    remove as never,
    preview as never,
    new McpDataMartModelMapper()
  );
  return { facade, graph, create, update, remove, preview };
}

describe('McpDataMartModelFacadeImpl', () => {
  it('requests the shared graph access filter and allowlists relationship metadata', async () => {
    const f = fixture();
    const result = await f.facade.listRelationships(actor, 'source');
    expect(f.graph.run).toHaveBeenCalledWith(
      expect.objectContaining({
        rootDataMartId: 'source',
        projectId: 'project',
        userId: 'user',
        roles: ['editor'],
        omitInaccessible: true,
      })
    );
    expect(result.nodes[0]).toMatchObject({
      aliasPath: 'orders',
      depth: 1,
      isBlocked: true,
      relationship: {
        id: 'relationship',
        targetAlias: 'orders',
        createdAt: '2026-11-05T00:00:00.000Z',
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/never|private-user/);
  });

  it('preserves draft joins and maps creation context into the existing shared use case', async () => {
    const f = fixture();
    const result = await f.facade.createRelationship(actor, {
      dataMartId: 'source',
      targetDataMartId: 'target',
      targetAlias: 'orders',
      joinConditions: [],
    });
    expect(result.id).toBe('relationship');
    expect(f.create.run).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceDataMartId: 'source',
        targetDataMartId: 'target',
        projectId: 'project',
        userId: 'user',
        roles: ['editor'],
        joinConditions: [],
      })
    );
  });

  it('preserves null description clearing and only edits the source relationship', async () => {
    const f = fixture();
    await f.facade.updateRelationship(actor, {
      dataMartId: 'source',
      relationshipId: 'relationship',
      description: null,
    });
    expect(f.update.run).toHaveBeenCalledWith(
      expect.objectContaining({
        relationshipId: 'relationship',
        sourceDataMartId: 'source',
        description: null,
        targetAlias: undefined,
        joinConditions: undefined,
      })
    );
    await f.facade.deleteRelationship(actor, 'source', 'relationship');
    expect(f.remove.run).toHaveBeenCalledWith(
      expect.objectContaining({
        relationshipId: 'relationship',
        sourceDataMartId: 'source',
        projectId: 'project',
        userId: 'user',
        roles: ['editor'],
      })
    );
  });

  it('omits target details when a shared update reports no target access', async () => {
    const f = fixture();
    f.update.run.mockResolvedValue({
      ...relationship,
      targetDataMart: {
        ...relationship.targetDataMart,
        userHasAccess: false,
        title: 'hidden-title',
      },
    });
    const result = await f.facade.updateRelationship(actor, {
      dataMartId: 'source',
      relationshipId: 'relationship',
      targetAlias: 'renamed',
    });
    expect(result.targetDataMart).toEqual({ id: 'target', userHasAccess: false });
    expect(JSON.stringify(result)).not.toContain('hidden-title');
  });

  it('previews drafts through the shared reader with bounded rows and cancellation', async () => {
    const f = fixture();
    const signal = new AbortController().signal;
    expect(await f.facade.preview(actor, 'source', undefined, signal)).toEqual({
      columns: [{ name: 'id', type: 'INT64' }],
      rows: [[1]],
      rowCount: 1,
      limit: 20,
      truncated: false,
    });
    expect(f.preview.run).toHaveBeenCalledWith(
      expect.objectContaining({
        dataMartId: 'source',
        projectId: 'project',
        userId: 'user',
        roles: ['editor'],
        limit: 20,
        filters: undefined,
        sort: undefined,
      }),
      signal
    );
  });

  it.each([0, 101, 1.5])('rejects preview limit %s before a warehouse call', async limit => {
    const f = fixture();
    await expect(f.facade.preview(actor, 'source', limit)).rejects.toMatchObject({ status: 400 });
    expect(f.preview.run).not.toHaveBeenCalled();
  });

  it.each([
    [new ForbiddenException('secret'), 403],
    [new BadRequestException('secret'), 400],
    [new BusinessViolationException('secret'), 400],
    [new Error('secret'), 500],
  ])('sanitizes model/provider errors and preserves failure status', async (error, status) => {
    const f = fixture();
    f.preview.run.mockRejectedValue(error);
    await expect(f.facade.preview(actor, 'source', 5)).rejects.toMatchObject({
      message: 'Unable to preview Data Mart',
      status,
    });
  });

  it('reports an alias conflict without returning private error details', async () => {
    const f = fixture();
    f.create.run.mockRejectedValue(
      new BusinessViolationException(
        'Alias "secret" is already used in another relationship for this data mart',
        { secret: 'secret' },
        'DATA_MART_RELATIONSHIP_ALIAS_TAKEN'
      )
    );
    const error = await f.facade
      .createRelationship(actor, {
        dataMartId: 'source',
        targetDataMartId: 'target',
        targetAlias: 'orders',
        joinConditions: [],
      })
      .catch(value => value);
    expect(error.message).toMatch(/alias.*already.*used/i);
    expect(JSON.stringify(error.getResponse())).not.toContain('secret');
  });

  it('tells the caller to refresh an empty output schema before previewing', async () => {
    const f = fixture();
    f.preview.run.mockRejectedValue(
      new BadRequestException(
        'This Data Mart has no visible fields in its Output Schema yet. Refresh the schema, then preview again.'
      )
    );
    await expect(f.facade.preview(actor, 'source')).rejects.toThrow('Refresh the schema');
  });
});
