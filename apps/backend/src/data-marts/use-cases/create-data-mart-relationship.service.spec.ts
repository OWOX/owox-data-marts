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

import { ForbiddenException } from '@nestjs/common';
import { CreateDataMartRelationshipService } from './create-data-mart-relationship.service';
import { CreateRelationshipCommand } from '../dto/domain/create-relationship.command';
import { EntityType, Action } from '../services/access-decision';

describe('CreateDataMartRelationshipService', () => {
  const sourceDataMart = {
    id: 'dm-source',
    storage: { id: 'storage-1', type: 'BIGQUERY' },
    schema: [],
  };
  const targetDataMart = {
    id: 'dm-target',
    storage: { id: 'storage-1', type: 'BIGQUERY' },
    schema: [],
  };
  const relationship = { id: 'rel-1', createdById: 'user-1' };

  const createService = (accessResults: [boolean, boolean] = [true, true]) => {
    const relationshipService = {
      validateNoSelfReference: jest.fn(),
      validateSameStorage: jest.fn(),
      validateUniqueAlias: jest.fn().mockResolvedValue(undefined),
      detectCycles: jest.fn().mockResolvedValue(false),
      validateJoinFieldTypes: jest.fn(),
      create: jest.fn().mockResolvedValue(relationship),
    };
    const dataMartService = {
      getByIdAndProjectId: jest
        .fn()
        .mockResolvedValueOnce(sourceDataMart)
        .mockResolvedValueOnce(targetDataMart),
    };
    const userProjectionsFetcherService = {
      fetchCreatedByUser: jest.fn().mockResolvedValue(null),
    };
    const mapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: 'rel-1' }),
    };
    const accessDecisionService = {
      canAccess: jest
        .fn()
        .mockResolvedValueOnce(accessResults[0])
        .mockResolvedValueOnce(accessResults[1]),
    };

    const service = new CreateDataMartRelationshipService(
      relationshipService as never,
      dataMartService as never,
      userProjectionsFetcherService as never,
      mapper as never,
      accessDecisionService as never
    );

    return { service, relationshipService, dataMartService, accessDecisionService };
  };

  beforeEach(() => jest.clearAllMocks());

  it('should create relationship when user has EDIT access on both DataMarts', async () => {
    const { service, relationshipService, accessDecisionService } = createService([true, true]);

    const command = new CreateRelationshipCommand(
      'dm-source',
      'dm-target',
      'alias1',
      [],
      'user-1',
      'proj-1',
      ['editor']
    );

    await service.run(command);

    expect(accessDecisionService.canAccess).toHaveBeenCalledTimes(2);
    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      'dm-source',
      Action.EDIT,
      'proj-1'
    );
    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      'dm-target',
      Action.EDIT,
      'proj-1'
    );
    expect(relationshipService.create).toHaveBeenCalled();
  });

  it('should throw ForbiddenException when user lacks EDIT on source DataMart', async () => {
    const { service } = createService([false, true]);

    const command = new CreateRelationshipCommand(
      'dm-source',
      'dm-target',
      'alias1',
      [],
      'user-1',
      'proj-1',
      ['viewer']
    );

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when user lacks EDIT on target DataMart', async () => {
    const { service } = createService([true, false]);

    const command = new CreateRelationshipCommand(
      'dm-source',
      'dm-target',
      'alias1',
      [],
      'user-1',
      'proj-1',
      ['editor']
    );

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('should skip access check when userId is empty', async () => {
    const { service, accessDecisionService } = createService([false, false]);

    const command = new CreateRelationshipCommand(
      'dm-source',
      'dm-target',
      'alias1',
      [],
      '',
      'proj-1',
      []
    );

    await service.run(command);

    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
  });
});
