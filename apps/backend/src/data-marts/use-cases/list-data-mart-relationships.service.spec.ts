jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));
jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ListDataMartRelationshipsService } from './list-data-mart-relationships.service';
import { ListRelationshipsCommand } from '../dto/domain/list-relationships.command';
import { EntityType, Action } from '../services/access-decision';

describe('ListDataMartRelationshipsService', () => {
  const relationships = [
    {
      id: 'rel-1',
      sourceDataMart: { id: 'dm-1' },
      targetDataMart: { id: 'dm-target-1' },
    },
    {
      id: 'rel-2',
      sourceDataMart: { id: 'dm-1' },
      targetDataMart: { id: 'dm-target-2' },
    },
  ];

  const createService = (
    accessMap: Map<string, boolean> = new Map([
      ['dm-1', true],
      ['dm-target-1', true],
      ['dm-target-2', true],
    ])
  ) => {
    const relationshipService = {
      findBySourceDataMartId: jest.fn().mockResolvedValue(relationships),
    };
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue({ id: 'dm-1' }),
    };
    const mapper = {
      toDomainDtoList: jest.fn().mockReturnValue([{ id: 'rel-1' }, { id: 'rel-2' }]),
    };
    const userProjectionsFetcherService = {
      fetchRelevantUserProjections: jest.fn().mockResolvedValue([]),
    };
    const accessDecisionService = {
      canAccessMany: jest.fn().mockResolvedValue(accessMap),
    };

    const service = new ListDataMartRelationshipsService(
      relationshipService as never,
      dataMartService as never,
      mapper as never,
      userProjectionsFetcherService as never,
      accessDecisionService as never
    );

    return { service, relationshipService, dataMartService, accessDecisionService, mapper };
  };

  beforeEach(() => jest.clearAllMocks());

  it('lists relationships and computes access map for source plus all targets', async () => {
    const { service, relationshipService, accessDecisionService, mapper } = createService();

    const command = new ListRelationshipsCommand('dm-1', 'proj-1', 'user-1', ['viewer']);

    const result = await service.run(command);

    expect(accessDecisionService.canAccessMany).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      EntityType.DATA_MART,
      ['dm-1', 'dm-target-1', 'dm-target-2'],
      Action.SEE,
      'proj-1'
    );
    expect(relationshipService.findBySourceDataMartId).toHaveBeenCalledWith('dm-1');
    expect(mapper.toDomainDtoList).toHaveBeenCalledWith(relationships, [], expect.any(Map));
    expect(result).toHaveLength(2);
  });

  it('does not throw when user lacks SEE on source or targets', async () => {
    const accessMap = new Map([
      ['dm-1', false],
      ['dm-target-1', false],
      ['dm-target-2', false],
    ]);
    const { service, mapper } = createService(accessMap);

    const command = new ListRelationshipsCommand('dm-1', 'proj-1', 'user-1', []);

    await expect(service.run(command)).resolves.toHaveLength(2);
    expect(mapper.toDomainDtoList).toHaveBeenCalledWith(relationships, [], accessMap);
  });

  it('throws UnauthorizedException when userId is empty', async () => {
    const { service, accessDecisionService, dataMartService } = createService();

    const command = new ListRelationshipsCommand('dm-1', 'proj-1', '', []);

    await expect(service.run(command)).rejects.toThrow(UnauthorizedException);
    expect(accessDecisionService.canAccessMany).not.toHaveBeenCalled();
    expect(dataMartService.getByIdAndProjectId).not.toHaveBeenCalled();
  });

  it('performs project-scope check via dataMartService before fetching relationships', async () => {
    const { service, dataMartService, relationshipService } = createService();

    const command = new ListRelationshipsCommand('dm-1', 'proj-1', 'user-1', ['viewer']);

    await service.run(command);

    expect(dataMartService.getByIdAndProjectId).toHaveBeenCalledWith('dm-1', 'proj-1');
    const lookupOrder = dataMartService.getByIdAndProjectId.mock.invocationCallOrder[0];
    const findOrder = relationshipService.findBySourceDataMartId.mock.invocationCallOrder[0];
    expect(lookupOrder).toBeLessThan(findOrder);
  });

  it('does not call canAccessMany when the project-scope lookup fails', async () => {
    const { service, dataMartService, accessDecisionService } = createService();
    dataMartService.getByIdAndProjectId.mockRejectedValueOnce(new NotFoundException('not found'));

    const command = new ListRelationshipsCommand('dm-1', 'proj-1', 'user-1', ['viewer']);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
    expect(accessDecisionService.canAccessMany).not.toHaveBeenCalled();
  });
});
