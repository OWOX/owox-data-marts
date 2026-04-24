jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));
jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ListRelationshipsByStorageService } from './list-relationships-by-storage.service';
import { ListRelationshipsByStorageCommand } from '../dto/domain/list-relationships-by-storage.command';
import { EntityType, Action } from '../services/access-decision';

describe('ListRelationshipsByStorageService', () => {
  const relationships = [{ id: 'rel-1' }, { id: 'rel-2' }];

  const createService = (canAccess = true) => {
    const relationshipService = {
      findByStorageId: jest.fn().mockResolvedValue(relationships),
    };
    const dataStorageService = {
      getByProjectIdAndId: jest.fn().mockResolvedValue({ id: 'storage-1' }),
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

    const service = new ListRelationshipsByStorageService(
      relationshipService as never,
      dataStorageService as never,
      mapper as never,
      userProjectionsFetcherService as never,
      accessDecisionService as never
    );

    return { service, relationshipService, dataStorageService, accessDecisionService, mapper };
  };

  beforeEach(() => jest.clearAllMocks());

  it('lists relationships when user has SEE access on storage', async () => {
    const { service, relationshipService, accessDecisionService } = createService(true);

    const command = new ListRelationshipsByStorageCommand('storage-1', 'proj-1', 'user-1', [
      'viewer',
    ]);

    const result = await service.run(command);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      EntityType.STORAGE,
      'storage-1',
      Action.SEE,
      'proj-1'
    );
    expect(relationshipService.findByStorageId).toHaveBeenCalledWith('storage-1', 'proj-1');
    expect(result).toHaveLength(2);
  });

  it('throws ForbiddenException when user lacks SEE on storage', async () => {
    const { service } = createService(false);

    const command = new ListRelationshipsByStorageCommand('storage-1', 'proj-1', 'user-1', []);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('throws UnauthorizedException when userId is empty', async () => {
    const { service, accessDecisionService, dataStorageService } = createService(true);

    const command = new ListRelationshipsByStorageCommand('storage-1', 'proj-1', '', []);

    await expect(service.run(command)).rejects.toThrow(UnauthorizedException);
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
    expect(dataStorageService.getByProjectIdAndId).not.toHaveBeenCalled();
  });

  it('performs project-scope check via dataStorageService before the access check', async () => {
    const { service, dataStorageService, accessDecisionService } = createService(true);

    const command = new ListRelationshipsByStorageCommand('storage-1', 'proj-1', 'user-1', [
      'viewer',
    ]);

    await service.run(command);

    expect(dataStorageService.getByProjectIdAndId).toHaveBeenCalledWith('proj-1', 'storage-1');
    const lookupOrder = dataStorageService.getByProjectIdAndId.mock.invocationCallOrder[0];
    const accessOrder = accessDecisionService.canAccess.mock.invocationCallOrder[0];
    expect(lookupOrder).toBeLessThan(accessOrder);
  });

  it('does not call canAccess when the project-scope lookup fails', async () => {
    const { service, dataStorageService, accessDecisionService } = createService(true);
    dataStorageService.getByProjectIdAndId.mockRejectedValueOnce(
      new NotFoundException('not found')
    );

    const command = new ListRelationshipsByStorageCommand('storage-1', 'proj-1', 'user-1', [
      'viewer',
    ]);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
  });
});
