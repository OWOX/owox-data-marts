jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));

import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Role } from '@owox/idp-protocol';
import { RelationshipDto } from '../dto/domain/relationship.dto';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { McpDataMartRelationshipsMapper } from '../mappers/mcp-data-mart-relationships.mapper';
import { McpDataMartRelationshipsFacadeImpl } from './mcp-data-mart-relationships.facade.impl';

describe('McpDataMartRelationshipsFacadeImpl', () => {
  const createService = { run: jest.fn() };
  const updateService = { run: jest.fn() };
  const deleteService = { run: jest.fn() };
  const graphService = { run: jest.fn() };
  const mapper = new RelationshipMapper();
  const facade = new McpDataMartRelationshipsFacadeImpl(
    createService as never,
    updateService as never,
    deleteService as never,
    graphService as never,
    mapper,
    new McpDataMartRelationshipsMapper()
  );
  const actor = {
    projectId: 'connected-project',
    userId: 'authenticated-user',
    roles: ['editor'] as Role[],
  };
  const relationship: RelationshipDto = {
    id: 'relationship-1',
    dataStorageId: 'storage-1',
    sourceDataMart: {
      id: 'source',
      title: 'Customers',
      status: DataMartStatus.PUBLISHED,
      userHasAccess: true,
      hasPrimaryKey: true,
    },
    targetDataMart: {
      id: 'target',
      title: 'Orders',
      status: DataMartStatus.DRAFT,
      userHasAccess: true,
      hasPrimaryKey: false,
    },
    targetAlias: 'orders',
    joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
    description: 'Customer orders',
    createdById: 'creator',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    modifiedAt: new Date('2026-10-02T00:00:00.000Z'),
    createdByUser: null,
  };
  const createRequest = {
    ...actor,
    dataMartId: 'source',
    targetDataMartId: 'target',
    targetAlias: 'orders',
    joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
    description: '  customer orders  ',
  };
  const updateRequest = {
    ...actor,
    dataMartId: 'source',
    relationshipId: 'relationship-1',
    description: null,
  };
  const deleteRequest = {
    ...actor,
    dataMartId: 'source',
    relationshipId: 'relationship-1',
  };
  const mutations = [
    [
      'create',
      (overrides: object) => facade.createRelationship({ ...createRequest, ...overrides }),
    ],
    [
      'update',
      (overrides: object) => facade.updateRelationship({ ...updateRequest, ...overrides }),
    ],
    [
      'delete',
      (overrides: object) => facade.deleteRelationship({ ...deleteRequest, ...overrides }),
    ],
  ] as const;

  beforeEach(() => {
    jest.resetAllMocks();
    createService.run.mockResolvedValue(relationship);
    updateService.run.mockResolvedValue(relationship);
    deleteService.run.mockResolvedValue(undefined);
    graphService.run.mockResolvedValue({ rootDataMartId: 'source', nodes: [] });
  });

  describe.each(mutations)('%s', (_name, invoke) => {
    it.each([{ roles: [] }, { roles: ['viewer'] }, { roles: ['unrecognized'] }])(
      'denies insufficient project roles $roles before executing a use case',
      async ({ roles }) => {
        await expect(invoke({ roles })).rejects.toThrow(ForbiddenException);
        for (const service of [createService, updateService, deleteService, graphService]) {
          expect(service.run).not.toHaveBeenCalled();
        }
      }
    );

    it('requires an authenticated actor before executing a use case', async () => {
      await expect(invoke({ userId: '' })).rejects.toThrow(UnauthorizedException);
      for (const service of [createService, updateService, deleteService, graphService]) {
        expect(service.run).not.toHaveBeenCalled();
      }
    });

    it('requires a connected project before executing a use case', async () => {
      await expect(invoke({ projectId: '' })).rejects.toThrow(ForbiddenException);
      for (const service of [createService, updateService, deleteService, graphService]) {
        expect(service.run).not.toHaveBeenCalled();
      }
    });

    it.each(['editor', 'admin'])('accepts the %s project role', async role => {
      await expect(invoke({ roles: [role] })).resolves.not.toThrow();
    });
  });

  it('maps create through the existing command and response mapper', async () => {
    const result = await facade.createRelationship(createRequest);

    expect(createService.run).toHaveBeenCalledWith({
      sourceDataMartId: 'source',
      targetDataMartId: 'target',
      targetAlias: 'orders',
      joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
      projectId: 'connected-project',
      userId: 'authenticated-user',
      roles: ['editor'],
      description: '  customer orders  ',
    });
    expect(result).toEqual({
      ...relationship,
      createdAt: '2026-10-01T00:00:00.000Z',
      modifiedAt: '2026-10-02T00:00:00.000Z',
    });
  });

  it('preserves update omission and explicit description clearing', async () => {
    await facade.updateRelationship(updateRequest);

    expect(updateService.run).toHaveBeenLastCalledWith({
      relationshipId: 'relationship-1',
      sourceDataMartId: 'source',
      projectId: 'connected-project',
      userId: 'authenticated-user',
      roles: ['editor'],
      targetAlias: undefined,
      joinConditions: undefined,
      description: null,
    });

    await facade.updateRelationship({ ...deleteRequest, joinConditions: [] });
    expect(updateService.run).toHaveBeenLastCalledWith(
      expect.objectContaining({ joinConditions: [], description: undefined })
    );
  });

  it('normalizes nullable Data Mart descriptions and returns only declared output fields', async () => {
    createService.run.mockResolvedValue({
      ...relationship,
      privateConfiguration: 'internal-only',
      sourceDataMart: { ...relationship.sourceDataMart, description: null },
      createdByUser: {
        userId: 'creator',
        fullName: 'Ada',
        email: null,
        avatar: null,
        privateConfiguration: 'internal-only',
      },
    });

    const result = await facade.createRelationship(createRequest);

    expect(result.sourceDataMart.description).toBeUndefined();
    expect(result).not.toHaveProperty('privateConfiguration');
    expect(result.createdByUser).toEqual({
      userId: 'creator',
      fullName: 'Ada',
      email: null,
      avatar: null,
    });
  });

  it('deletes only the requested source relationship in the connected project', async () => {
    await expect(facade.deleteRelationship(deleteRequest)).resolves.toBeUndefined();

    expect(deleteService.run).toHaveBeenCalledWith({
      relationshipId: 'relationship-1',
      sourceDataMartId: 'source',
      projectId: 'connected-project',
      userId: 'authenticated-user',
      roles: ['editor'],
    });
  });

  it('allows viewers to read the graph using the authenticated project and actor', async () => {
    const node = {
      relationship,
      aliasPath: 'orders',
      depth: 1,
      isCycleStub: false,
      isBlocked: true,
    };
    graphService.run.mockResolvedValue({ rootDataMartId: 'source', nodes: [node] });

    const result = await facade.getRelationshipGraph({
      ...actor,
      dataMartId: 'source',
      roles: ['viewer'],
    });

    expect(graphService.run).toHaveBeenCalledWith({
      rootDataMartId: 'source',
      projectId: 'connected-project',
      userId: 'authenticated-user',
      roles: ['viewer'],
    });
    expect(result).toEqual({
      rootDataMartId: 'source',
      nodes: [
        {
          ...node,
          relationship: {
            ...relationship,
            createdAt: '2026-10-01T00:00:00.000Z',
            modifiedAt: '2026-10-02T00:00:00.000Z',
          },
        },
      ],
    });
  });

  it('masks inaccessible source and target metadata in the graph output', async () => {
    graphService.run.mockResolvedValue({
      rootDataMartId: 'source',
      nodes: [
        {
          relationship: {
            ...relationship,
            sourceDataMart: {
              ...relationship.sourceDataMart,
              userHasAccess: false,
              description: 'Private source description',
            },
            targetDataMart: {
              ...relationship.targetDataMart,
              userHasAccess: false,
              description: 'Private target description',
            },
          },
          aliasPath: 'orders',
          depth: 2,
          isCycleStub: true,
          isBlocked: true,
        },
      ],
    });

    const result = await facade.getRelationshipGraph({ ...actor, dataMartId: 'source' });

    expect(result.nodes[0].relationship.sourceDataMart).toEqual({
      id: 'source',
      userHasAccess: false,
    });
    expect(result.nodes[0].relationship.targetDataMart).toEqual({
      id: 'target',
      userHasAccess: false,
    });
    expect(result.nodes[0]).toMatchObject({
      aliasPath: 'orders',
      depth: 2,
      isCycleStub: true,
      isBlocked: true,
    });
  });

  it('denies graph access without a recognized viewer role or actor', async () => {
    await expect(
      facade.getRelationshipGraph({ ...actor, dataMartId: 'source', roles: [] })
    ).rejects.toThrow(ForbiddenException);
    await expect(
      facade.getRelationshipGraph({ ...actor, dataMartId: 'source', userId: '' })
    ).rejects.toThrow(UnauthorizedException);
    expect(graphService.run).not.toHaveBeenCalled();
  });

  it.each([
    ['create', createService, () => facade.createRelationship(createRequest)],
    ['update', updateService, () => facade.updateRelationship(updateRequest)],
    ['delete', deleteService, () => facade.deleteRelationship(deleteRequest)],
    ['graph', graphService, () => facade.getRelationshipGraph({ ...actor, dataMartId: 'source' })],
  ] as const)(
    'preserves %s resource authorization and project-bound errors',
    async (_name, service, invoke) => {
      for (const error of [new ForbiddenException(), new NotFoundException()]) {
        service.run.mockRejectedValueOnce(error);
        await expect(invoke()).rejects.toBe(error);
      }
    }
  );
});
