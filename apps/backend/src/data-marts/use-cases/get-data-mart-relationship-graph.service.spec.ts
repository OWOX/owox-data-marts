jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));
jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GetDataMartRelationshipGraphService } from './get-data-mart-relationship-graph.service';
import { GetRelationshipGraphCommand } from '../dto/domain/get-relationship-graph.command';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { Action, EntityType } from '../services/access-decision';

interface RelFixture {
  id: string;
  sourceId: string;
  targetId: string;
  targetAlias: string;
  joinConditions?: Array<{ sourceFieldName: string; targetFieldName: string }>;
  targetStatus?: DataMartStatus;
}

function makeRelEntity(f: RelFixture) {
  return {
    id: f.id,
    sourceDataMart: { id: f.sourceId, title: `DM ${f.sourceId}`, status: DataMartStatus.PUBLISHED },
    targetDataMart: {
      id: f.targetId,
      title: `DM ${f.targetId}`,
      status: f.targetStatus ?? DataMartStatus.PUBLISHED,
    },
    targetAlias: f.targetAlias,
    joinConditions: f.joinConditions ?? [{ sourceFieldName: 'id', targetFieldName: 'id' }],
    createdById: 'user-creator',
  };
}

function build(opts: {
  relationships: RelFixture[];
  rootId?: string;
  rootStatus?: DataMartStatus;
  accessMap?: Map<string, boolean>;
}) {
  const rootId = opts.rootId ?? 'dm-root';
  const entities = opts.relationships.map(makeRelEntity);
  const involvedIds = new Set<string>([rootId]);
  for (const e of entities) {
    involvedIds.add(e.sourceDataMart.id);
    involvedIds.add(e.targetDataMart.id);
  }
  const accessMap =
    opts.accessMap ?? new Map<string, boolean>([...involvedIds].map(id => [id, true]));

  const relationshipService = {
    findByStorageId: jest.fn().mockResolvedValue(entities),
  };
  const dataMartService = {
    getByIdAndProjectId: jest.fn().mockResolvedValue({
      id: rootId,
      status: opts.rootStatus ?? DataMartStatus.PUBLISHED,
      storage: { id: 'storage-1' },
    }),
  };
  const toDomainDto = (entity: ReturnType<typeof makeRelEntity>) => ({
    id: entity.id,
    sourceDataMart: {
      id: entity.sourceDataMart.id,
      userHasAccess: accessMap.get(entity.sourceDataMart.id) ?? false,
    },
    targetDataMart: {
      id: entity.targetDataMart.id,
      userHasAccess: accessMap.get(entity.targetDataMart.id) ?? false,
    },
    targetAlias: entity.targetAlias,
  });
  const mapper = {
    toDomainDtoList: jest
      .fn()
      .mockImplementation((entities: ReturnType<typeof makeRelEntity>[]) =>
        entities.map(toDomainDto)
      ),
  };
  const userProjectionsFetcherService = {
    fetchRelevantUserProjections: jest.fn().mockResolvedValue({ getByUserId: () => null }),
  };
  const accessDecisionService = {
    canAccessMany: jest.fn().mockResolvedValue(accessMap),
  };

  const service = new GetDataMartRelationshipGraphService(
    relationshipService as never,
    dataMartService as never,
    mapper as never,
    userProjectionsFetcherService as never,
    accessDecisionService as never
  );

  return { service, dataMartService, relationshipService, accessDecisionService, mapper, rootId };
}

const command = (rootId = 'dm-root') =>
  new GetRelationshipGraphCommand(rootId, 'proj-1', 'user-1', ['viewer']);

describe('GetDataMartRelationshipGraphService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws UnauthorizedException when userId is empty', async () => {
    const { service } = build({ relationships: [] });

    await expect(
      service.run(new GetRelationshipGraphCommand('dm-root', 'proj-1', '', []))
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws ForbiddenException when user lacks SEE on the root data mart', async () => {
    const accessMap = new Map<string, boolean>([['dm-root', false]]);
    const { service, accessDecisionService } = build({
      relationships: [],
      accessMap,
    });

    await expect(service.run(command())).rejects.toThrow(ForbiddenException);
    expect(accessDecisionService.canAccessMany).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      EntityType.DATA_MART,
      ['dm-root'],
      Action.SEE,
      'proj-1'
    );
  });

  it('returns an empty node list when the root has no relationships', async () => {
    const { service } = build({ relationships: [] });

    const result = await service.run(command());

    expect(result.rootDataMartId).toBe('dm-root');
    expect(result.nodes).toEqual([]);
  });

  it('returns direct (depth=1) children with aliasPath set to the relationship alias', async () => {
    const { service } = build({
      relationships: [
        { id: 'rel-1', sourceId: 'dm-root', targetId: 'dm-a', targetAlias: 'orders' },
        { id: 'rel-2', sourceId: 'dm-root', targetId: 'dm-b', targetAlias: 'products' },
      ],
    });

    const result = await service.run(command());

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]).toMatchObject({
      aliasPath: 'orders',
      depth: 1,
      isCycleStub: false,
      isBlocked: false,
    });
    expect(result.nodes[1]).toMatchObject({ aliasPath: 'products', depth: 1 });
  });

  it('expands transitive children with dot-joined aliasPath and incremented depth', async () => {
    const { service } = build({
      relationships: [
        { id: 'rel-1', sourceId: 'dm-root', targetId: 'dm-a', targetAlias: 'orders' },
        { id: 'rel-2', sourceId: 'dm-a', targetId: 'dm-b', targetAlias: 'line_items' },
        { id: 'rel-3', sourceId: 'dm-b', targetId: 'dm-c', targetAlias: 'product' },
      ],
    });

    const result = await service.run(command());

    expect(result.nodes.map(n => `${n.aliasPath}@${n.depth}`)).toEqual([
      'orders@1',
      'orders.line_items@2',
      'orders.line_items.product@3',
    ]);
  });

  it('emits a cycle stub when traversal returns to an ancestor and does not recurse below', async () => {
    const { service } = build({
      relationships: [
        { id: 'rel-1', sourceId: 'dm-root', targetId: 'dm-a', targetAlias: 'a' },
        { id: 'rel-2', sourceId: 'dm-a', targetId: 'dm-root', targetAlias: 'back' },
        { id: 'rel-3', sourceId: 'dm-root', targetId: 'dm-z', targetAlias: 'z' },
      ],
    });

    const result = await service.run(command());

    const stub = result.nodes.find(n => n.aliasPath === 'a.back');
    expect(stub?.isCycleStub).toBe(true);
    expect(result.nodes.some(n => n.aliasPath.startsWith('a.back.'))).toBe(false);
  });

  it('cascades isBlocked from a DRAFT ancestor down the subtree', async () => {
    const { service } = build({
      relationships: [
        {
          id: 'rel-1',
          sourceId: 'dm-root',
          targetId: 'dm-draft',
          targetAlias: 'draft',
          targetStatus: DataMartStatus.DRAFT,
        },
        { id: 'rel-2', sourceId: 'dm-draft', targetId: 'dm-leaf', targetAlias: 'leaf' },
      ],
    });

    const result = await service.run(command());

    const draftNode = result.nodes.find(n => n.aliasPath === 'draft');
    const leafNode = result.nodes.find(n => n.aliasPath === 'draft.leaf');
    expect(draftNode?.isBlocked).toBe(false);
    expect(leafNode?.isBlocked).toBe(true);
  });

  it('cascades isBlocked from an unconfigured join (empty joinConditions)', async () => {
    const { service } = build({
      relationships: [
        {
          id: 'rel-1',
          sourceId: 'dm-root',
          targetId: 'dm-a',
          targetAlias: 'a',
          joinConditions: [],
        },
        { id: 'rel-2', sourceId: 'dm-a', targetId: 'dm-leaf', targetAlias: 'leaf' },
      ],
    });

    const result = await service.run(command());

    expect(result.nodes.find(n => n.aliasPath === 'a')?.isBlocked).toBe(false);
    expect(result.nodes.find(n => n.aliasPath === 'a.leaf')?.isBlocked).toBe(true);
  });

  it('still returns nodes when the user lacks SEE on a target — userHasAccess is reflected per node', async () => {
    const accessMap = new Map<string, boolean>([
      ['dm-root', true],
      ['dm-a', false],
    ]);
    const { service } = build({
      relationships: [{ id: 'rel-1', sourceId: 'dm-root', targetId: 'dm-a', targetAlias: 'a' }],
      accessMap,
    });

    const result = await service.run(command());

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].relationship.targetDataMart.userHasAccess).toBe(false);
  });

  it('cascades isBlocked from a DRAFT root onto its direct children', async () => {
    const { service } = build({
      relationships: [{ id: 'rel-1', sourceId: 'dm-root', targetId: 'dm-a', targetAlias: 'a' }],
      rootStatus: DataMartStatus.DRAFT,
    });

    const result = await service.run(command());

    expect(result.nodes[0].isBlocked).toBe(true);
  });

  it('queries access for the union of root, all sources and all targets in the graph', async () => {
    const { service, accessDecisionService } = build({
      relationships: [
        { id: 'rel-1', sourceId: 'dm-root', targetId: 'dm-a', targetAlias: 'a' },
        { id: 'rel-2', sourceId: 'dm-a', targetId: 'dm-b', targetAlias: 'b' },
      ],
    });

    await service.run(command());

    const idsArg = accessDecisionService.canAccessMany.mock.calls[0][3] as string[];
    expect(new Set(idsArg)).toEqual(new Set(['dm-root', 'dm-a', 'dm-b']));
  });
});
