jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));
jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ListDataMartRelationshipsService } from './list-data-mart-relationships.service';
import { ListRelationshipsCommand } from '../dto/domain/list-relationships.command';
import { EntityType, Action } from '../services/access-decision';

describe('ListDataMartRelationshipsService', () => {
  const relationships = [{ id: 'rel-1' }, { id: 'rel-2' }];

  const createService = (canAccess = true) => {
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
      canAccess: jest.fn().mockResolvedValue(canAccess),
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

  it('lists relationships when user has SEE access on DataMart', async () => {
    const { service, relationshipService, accessDecisionService } = createService(true);

    const command = new ListRelationshipsCommand('dm-1', 'proj-1', 'user-1', ['viewer']);

    const result = await service.run(command);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      EntityType.DATA_MART,
      'dm-1',
      Action.SEE,
      'proj-1'
    );
    expect(relationshipService.findBySourceDataMartId).toHaveBeenCalledWith('dm-1');
    expect(result).toHaveLength(2);
  });

  it('throws ForbiddenException when user lacks SEE on DataMart', async () => {
    const { service } = createService(false);

    const command = new ListRelationshipsCommand('dm-1', 'proj-1', 'user-1', []);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('throws UnauthorizedException when userId is empty', async () => {
    const { service, accessDecisionService, dataMartService } = createService(true);

    const command = new ListRelationshipsCommand('dm-1', 'proj-1', '', []);

    await expect(service.run(command)).rejects.toThrow(UnauthorizedException);
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
    expect(dataMartService.getByIdAndProjectId).not.toHaveBeenCalled();
  });

  it('performs project-scope check via dataMartService before the access check', async () => {
    const { service, dataMartService, accessDecisionService } = createService(true);

    const command = new ListRelationshipsCommand('dm-1', 'proj-1', 'user-1', ['viewer']);

    await service.run(command);

    expect(dataMartService.getByIdAndProjectId).toHaveBeenCalledWith('dm-1', 'proj-1');
    const lookupOrder = dataMartService.getByIdAndProjectId.mock.invocationCallOrder[0];
    const accessOrder = accessDecisionService.canAccess.mock.invocationCallOrder[0];
    expect(lookupOrder).toBeLessThan(accessOrder);
  });

  it('does not call canAccess when the project-scope lookup fails', async () => {
    const { service, dataMartService, accessDecisionService } = createService(true);
    dataMartService.getByIdAndProjectId.mockRejectedValueOnce(new NotFoundException('not found'));

    const command = new ListRelationshipsCommand('dm-1', 'proj-1', 'user-1', ['viewer']);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
  });
});
