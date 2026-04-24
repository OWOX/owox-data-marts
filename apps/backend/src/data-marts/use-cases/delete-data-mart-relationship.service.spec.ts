jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DeleteDataMartRelationshipService } from './delete-data-mart-relationship.service';
import { DeleteRelationshipCommand } from '../dto/domain/delete-relationship.command';
import { EntityType, Action } from '../services/access-decision';

describe('DeleteDataMartRelationshipService', () => {
  const relationship = {
    id: 'rel-1',
    sourceDataMart: { id: 'dm-source' },
  };

  const createService = (canAccess = true, foundRelationship = relationship) => {
    const relationshipService = {
      findById: jest.fn().mockResolvedValue(foundRelationship),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue({ id: 'dm-source' }),
    };
    const reportDataCacheService = {
      invalidateByDataMartId: jest.fn().mockResolvedValue(undefined),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(canAccess),
    };

    const service = new DeleteDataMartRelationshipService(
      relationshipService as never,
      dataMartService as never,
      reportDataCacheService as never,
      accessDecisionService as never
    );

    return {
      service,
      relationshipService,
      dataMartService,
      reportDataCacheService,
      accessDecisionService,
    };
  };

  beforeEach(() => jest.clearAllMocks());

  it('should delete relationship when user has EDIT access on source DataMart', async () => {
    const { service, relationshipService, accessDecisionService } = createService(true);

    const command = new DeleteRelationshipCommand('rel-1', 'dm-source', 'proj-1', 'user-1', [
      'editor',
    ]);

    await service.run(command);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      'dm-source',
      Action.EDIT,
      'proj-1'
    );
    expect(relationshipService.delete).toHaveBeenCalledWith(relationship);
  });

  it('should throw ForbiddenException when user lacks EDIT on source DataMart', async () => {
    const { service } = createService(false);

    const command = new DeleteRelationshipCommand('rel-1', 'dm-source', 'proj-1', 'user-1', [
      'viewer',
    ]);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException when relationship not found', async () => {
    const { service } = createService(true, null as never);

    const command = new DeleteRelationshipCommand('rel-1', 'dm-source', 'proj-1', 'user-1', [
      'editor',
    ]);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
  });

  it('throws UnauthorizedException when userId is empty', async () => {
    const { service, accessDecisionService, relationshipService, dataMartService } =
      createService(true);

    const command = new DeleteRelationshipCommand('rel-1', 'dm-source', 'proj-1', '', []);

    await expect(service.run(command)).rejects.toThrow(UnauthorizedException);
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
    expect(relationshipService.findById).not.toHaveBeenCalled();
    expect(dataMartService.getByIdAndProjectId).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when source data mart is not in the caller project', async () => {
    const { service, dataMartService, relationshipService, accessDecisionService } =
      createService(true);
    dataMartService.getByIdAndProjectId.mockRejectedValueOnce(
      new NotFoundException('DataMart not found')
    );

    const command = new DeleteRelationshipCommand('rel-1', 'dm-source', 'other-proj', 'user-1', [
      'editor',
    ]);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
    expect(relationshipService.findById).not.toHaveBeenCalled();
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
  });
});
