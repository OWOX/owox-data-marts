jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { ForbiddenException } from '@nestjs/common';
import { UpdateBlendedFieldsConfigService } from './update-blended-fields-config.service';
import { UpdateBlendedFieldsConfigCommand } from '../dto/domain/update-blended-fields-config.command';
import { EntityType, Action } from '../services/access-decision';

describe('UpdateBlendedFieldsConfigService', () => {
  const dataMart = {
    id: 'dm-1',
    projectId: 'proj-1',
    blendedFieldsConfig: null,
  };

  const createService = (canAccess = true) => {
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue({ ...dataMart }),
      save: jest.fn().mockResolvedValue(dataMart),
    };
    const reportDataCacheService = {
      invalidateByDataMartId: jest.fn().mockResolvedValue(undefined),
    };
    const mapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: 'dm-1' }),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(canAccess),
    };

    const service = new UpdateBlendedFieldsConfigService(
      dataMartService as never,
      reportDataCacheService as never,
      mapper as never,
      accessDecisionService as never
    );

    return { service, dataMartService, reportDataCacheService, accessDecisionService };
  };

  beforeEach(() => jest.clearAllMocks());

  it('should update blended fields config when user has EDIT access', async () => {
    const { service, accessDecisionService } = createService(true);

    const command = new UpdateBlendedFieldsConfigCommand('dm-1', 'proj-1', null, 'user-1', [
      'editor',
    ]);

    await service.run(command);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      'dm-1',
      Action.EDIT,
      'proj-1'
    );
  });

  it('should throw ForbiddenException when user lacks EDIT access', async () => {
    const { service } = createService(false);

    const command = new UpdateBlendedFieldsConfigCommand('dm-1', 'proj-1', null, 'user-1', [
      'viewer',
    ]);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('should skip access check when userId is empty', async () => {
    const { service, accessDecisionService } = createService(false);

    const command = new UpdateBlendedFieldsConfigCommand('dm-1', 'proj-1', null, '', []);

    await service.run(command);

    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
  });
});
