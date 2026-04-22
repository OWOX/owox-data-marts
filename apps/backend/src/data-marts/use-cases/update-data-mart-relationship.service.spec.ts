jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));

jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpdateDataMartRelationshipService } from './update-data-mart-relationship.service';
import { UpdateRelationshipCommand } from '../dto/domain/update-relationship.command';
import { EntityType, Action } from '../services/access-decision';

describe('UpdateDataMartRelationshipService', () => {
  const relationship = {
    id: 'rel-1',
    sourceDataMart: { id: 'dm-source', schema: [] },
    targetDataMart: { id: 'dm-target', schema: [] },
    targetAlias: 'old-alias',
    createdById: 'user-1',
  };

  const createService = (canAccess = true) => {
    const relationshipService = {
      findById: jest.fn().mockResolvedValue(relationship),
      validateUniqueAlias: jest.fn().mockResolvedValue(undefined),
      validateJoinFieldTypes: jest.fn(),
      update: jest.fn().mockResolvedValue({ ...relationship, targetAlias: 'new-alias' }),
    };
    const dataMartService = {
      findById: jest.fn().mockResolvedValue(null),
    };
    const userProjectionsFetcherService = {
      fetchCreatedByUser: jest.fn().mockResolvedValue(null),
    };
    const reportDataCacheService = {
      invalidateByDataMartId: jest.fn().mockResolvedValue(undefined),
    };
    const mapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: 'rel-1' }),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(canAccess),
    };

    const service = new UpdateDataMartRelationshipService(
      relationshipService as never,
      dataMartService as never,
      userProjectionsFetcherService as never,
      reportDataCacheService as never,
      mapper as never,
      accessDecisionService as never
    );

    return { service, relationshipService, accessDecisionService };
  };

  beforeEach(() => jest.clearAllMocks());

  it('should update relationship when user has EDIT access on source DataMart', async () => {
    const { service, accessDecisionService } = createService(true);

    const command = new UpdateRelationshipCommand(
      'rel-1',
      'dm-source',
      'user-1',
      'proj-1',
      ['editor'],
      'new-alias',
      undefined
    );

    await service.run(command);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      'dm-source',
      Action.EDIT,
      'proj-1'
    );
  });

  it('should throw ForbiddenException when user lacks EDIT on source DataMart', async () => {
    const { service } = createService(false);

    const command = new UpdateRelationshipCommand(
      'rel-1',
      'dm-source',
      'user-1',
      'proj-1',
      ['viewer'],
      'new-alias',
      undefined
    );

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException when relationship not found', async () => {
    const { accessDecisionService } = createService(true);
    const { relationshipService } = createService(true);
    relationshipService.findById = jest.fn().mockResolvedValue(null);

    const badService = new UpdateDataMartRelationshipService(
      relationshipService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      accessDecisionService as never
    );

    const command = new UpdateRelationshipCommand('rel-1', 'dm-source', 'user-1', 'proj-1', []);

    await expect(badService.run(command)).rejects.toThrow(NotFoundException);
  });

  it('should skip access check when userId is empty', async () => {
    const { service, accessDecisionService } = createService(false);

    const command = new UpdateRelationshipCommand('rel-1', 'dm-source', '', 'proj-1', []);

    await service.run(command);

    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
  });
});
