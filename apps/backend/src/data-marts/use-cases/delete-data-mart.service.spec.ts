jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DeleteDataMartCommand } from '../dto/domain/delete-data-mart.command';
import { DeleteDataMartService } from './delete-data-mart.service';

describe('DeleteDataMartService', () => {
  it('captures inbound source data marts before relationship deletion and schedules search invalidation', async () => {
    const dataMart = {
      id: 'target-1',
      projectId: 'project-1',
      storage: { type: DataStorageType.GOOGLE_BIGQUERY },
    };
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
      softDeleteByIdAndProjectId: jest.fn().mockResolvedValue(undefined),
    };
    const scheduledTriggerService = {
      deleteAllByDataMartIdAndProjectId: jest.fn().mockResolvedValue(undefined),
    };
    const reportService = {
      deleteAllByDataMartIdAndProjectId: jest.fn().mockResolvedValue(undefined),
    };
    const legacyDataMartsService = {
      deleteDataMart: jest.fn().mockResolvedValue(undefined),
    };
    const connectorSourceCredentialsService = {
      deleteSecretsByDataMart: jest.fn().mockResolvedValue(undefined),
    };
    const relationshipService = {
      deleteAllByDataMartId: jest.fn().mockResolvedValue(undefined),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    };
    const searchIndexInvalidation = {
      findInboundSourceDataMartIds: jest.fn().mockResolvedValue(['source-1', 'source-2']),
      scheduleDataMartDeleted: jest.fn().mockResolvedValue(undefined),
    };

    const service = new DeleteDataMartService(
      dataMartService as never,
      scheduledTriggerService as never,
      reportService as never,
      legacyDataMartsService as never,
      connectorSourceCredentialsService as never,
      relationshipService as never,
      accessDecisionService as never,
      searchIndexInvalidation as never
    );

    await service.run(new DeleteDataMartCommand('target-1', 'project-1'));

    expect(searchIndexInvalidation.findInboundSourceDataMartIds).toHaveBeenCalledWith(
      'target-1',
      'project-1'
    );
    expect(relationshipService.deleteAllByDataMartId).toHaveBeenCalledWith('target-1');
    expect(
      searchIndexInvalidation.findInboundSourceDataMartIds.mock.invocationCallOrder[0]
    ).toBeLessThan(relationshipService.deleteAllByDataMartId.mock.invocationCallOrder[0]);
    expect(searchIndexInvalidation.scheduleDataMartDeleted).toHaveBeenCalledWith(
      'target-1',
      'project-1',
      ['source-1', 'source-2']
    );
  });
});
