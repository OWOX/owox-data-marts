jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));
jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GetDataMartRelationshipService } from './get-data-mart-relationship.service';
import { GetRelationshipCommand } from '../dto/domain/get-relationship.command';
import { EntityType, Action } from '../services/access-decision';

describe('GetDataMartRelationshipService', () => {
  const relationship = {
    id: 'rel-1',
    sourceDataMart: { id: 'dm-source' },
  };

  const createService = (canAccess = true, foundRelationship = relationship) => {
    const relationshipService = {
      findById: jest.fn().mockResolvedValue(foundRelationship),
    };
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue({ id: 'dm-source' }),
    };
    const mapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: 'rel-1' }),
    };
    const userProjectionsFetcherService = {
      fetchCreatedByUser: jest.fn().mockResolvedValue(null),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(canAccess),
    };

    const service = new GetDataMartRelationshipService(
      relationshipService as never,
      dataMartService as never,
      mapper as never,
      userProjectionsFetcherService as never,
      accessDecisionService as never
    );

    return { service, relationshipService, dataMartService, accessDecisionService, mapper };
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns relationship when user has SEE access on source DataMart', async () => {
    const { service, accessDecisionService, relationshipService } = createService(true);

    const command = new GetRelationshipCommand('rel-1', 'dm-source', 'proj-1', 'user-1', [
      'viewer',
    ]);

    const result = await service.run(command);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      EntityType.DATA_MART,
      'dm-source',
      Action.SEE,
      'proj-1'
    );
    expect(relationshipService.findById).toHaveBeenCalledWith('rel-1');
    expect(result).toEqual({ id: 'rel-1' });
  });

  it('throws ForbiddenException when user lacks SEE on DataMart', async () => {
    const { service } = createService(false);

    const command = new GetRelationshipCommand('rel-1', 'dm-source', 'proj-1', 'user-1', []);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when relationship is not found', async () => {
    const { service } = createService(true, null as never);

    const command = new GetRelationshipCommand('rel-1', 'dm-source', 'proj-1', 'user-1', [
      'viewer',
    ]);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when relationship belongs to a different source DataMart', async () => {
    const { service } = createService(true, {
      id: 'rel-1',
      sourceDataMart: { id: 'dm-other' },
    });

    const command = new GetRelationshipCommand('rel-1', 'dm-source', 'proj-1', 'user-1', []);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
  });

  it('throws UnauthorizedException when userId is empty', async () => {
    const { service, accessDecisionService, dataMartService } = createService(true);

    const command = new GetRelationshipCommand('rel-1', 'dm-source', 'proj-1', '', []);

    await expect(service.run(command)).rejects.toThrow(UnauthorizedException);
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
    expect(dataMartService.getByIdAndProjectId).not.toHaveBeenCalled();
  });

  it('performs project-scope check via dataMartService before the access check', async () => {
    const { service, dataMartService, accessDecisionService } = createService(true);

    const command = new GetRelationshipCommand('rel-1', 'dm-source', 'proj-1', 'user-1', [
      'viewer',
    ]);

    await service.run(command);

    expect(dataMartService.getByIdAndProjectId).toHaveBeenCalledWith('dm-source', 'proj-1');
    const lookupOrder = dataMartService.getByIdAndProjectId.mock.invocationCallOrder[0];
    const accessOrder = accessDecisionService.canAccess.mock.invocationCallOrder[0];
    expect(lookupOrder).toBeLessThan(accessOrder);
  });

  it('does not call canAccess when the project-scope lookup fails', async () => {
    const { service, dataMartService, accessDecisionService } = createService(true);
    dataMartService.getByIdAndProjectId.mockRejectedValueOnce(new NotFoundException('not found'));

    const command = new GetRelationshipCommand('rel-1', 'dm-source', 'proj-1', 'user-1', [
      'viewer',
    ]);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
  });
});
