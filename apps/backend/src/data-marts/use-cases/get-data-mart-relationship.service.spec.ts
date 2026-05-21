jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));
jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GetDataMartRelationshipService } from './get-data-mart-relationship.service';
import { GetRelationshipCommand } from '../dto/domain/get-relationship.command';
import { EntityType, Action } from '../services/access-decision';

describe('GetDataMartRelationshipService', () => {
  const relationship = {
    id: 'rel-1',
    sourceDataMart: { id: 'dm-source' },
    targetDataMart: { id: 'dm-target' },
  };

  const createService = (
    accessMap: Map<string, boolean> = new Map([
      ['dm-source', true],
      ['dm-target', true],
    ]),
    foundRelationship: typeof relationship | null = relationship
  ) => {
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
      canAccessMany: jest.fn().mockResolvedValue(accessMap),
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

  it('returns relationship with computed access flags for source and target', async () => {
    const accessMap = new Map([
      ['dm-source', true],
      ['dm-target', false],
    ]);
    const { service, accessDecisionService, relationshipService, mapper } =
      createService(accessMap);

    const command = new GetRelationshipCommand('rel-1', 'dm-source', 'proj-1', 'user-1', [
      'viewer',
    ]);

    const result = await service.run(command);

    expect(accessDecisionService.canAccessMany).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      EntityType.DATA_MART,
      ['dm-source', 'dm-target'],
      Action.SEE,
      'proj-1'
    );
    expect(relationshipService.findById).toHaveBeenCalledWith('rel-1');
    expect(mapper.toDomainDto).toHaveBeenCalledWith(relationship, null, accessMap);
    expect(result).toEqual({ id: 'rel-1' });
  });

  it('does not throw when user lacks SEE on source or target data mart', async () => {
    const accessMap = new Map([
      ['dm-source', false],
      ['dm-target', false],
    ]);
    const { service, mapper } = createService(accessMap);

    const command = new GetRelationshipCommand('rel-1', 'dm-source', 'proj-1', 'user-1', []);

    await expect(service.run(command)).resolves.toEqual({ id: 'rel-1' });
    expect(mapper.toDomainDto).toHaveBeenCalledWith(relationship, null, accessMap);
  });

  it('throws NotFoundException when relationship is not found', async () => {
    const { service } = createService(undefined, null);

    const command = new GetRelationshipCommand('rel-1', 'dm-source', 'proj-1', 'user-1', [
      'viewer',
    ]);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when relationship belongs to a different source DataMart', async () => {
    const { service } = createService(undefined, {
      id: 'rel-1',
      sourceDataMart: { id: 'dm-other' },
      targetDataMart: { id: 'dm-target' },
    });

    const command = new GetRelationshipCommand('rel-1', 'dm-source', 'proj-1', 'user-1', []);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
  });

  it('throws UnauthorizedException when userId is empty', async () => {
    const { service, accessDecisionService, dataMartService } = createService();

    const command = new GetRelationshipCommand('rel-1', 'dm-source', 'proj-1', '', []);

    await expect(service.run(command)).rejects.toThrow(UnauthorizedException);
    expect(accessDecisionService.canAccessMany).not.toHaveBeenCalled();
    expect(dataMartService.getByIdAndProjectId).not.toHaveBeenCalled();
  });

  it('performs project-scope check via dataMartService before fetching the relationship', async () => {
    const { service, dataMartService, relationshipService } = createService();

    const command = new GetRelationshipCommand('rel-1', 'dm-source', 'proj-1', 'user-1', [
      'viewer',
    ]);

    await service.run(command);

    expect(dataMartService.getByIdAndProjectId).toHaveBeenCalledWith('dm-source', 'proj-1');
    const lookupOrder = dataMartService.getByIdAndProjectId.mock.invocationCallOrder[0];
    const findOrder = relationshipService.findById.mock.invocationCallOrder[0];
    expect(lookupOrder).toBeLessThan(findOrder);
  });

  it('does not call canAccessMany when the project-scope lookup fails', async () => {
    const { service, dataMartService, accessDecisionService } = createService();
    dataMartService.getByIdAndProjectId.mockRejectedValueOnce(new NotFoundException('not found'));

    const command = new GetRelationshipCommand('rel-1', 'dm-source', 'proj-1', 'user-1', [
      'viewer',
    ]);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
    expect(accessDecisionService.canAccessMany).not.toHaveBeenCalled();
  });
});
