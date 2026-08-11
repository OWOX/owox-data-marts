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
      getSecretsByDataMart: jest.fn().mockResolvedValue([]),
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

  it('hands over credentials still referenced by another Data Mart instead of deleting them', async () => {
    const dataMart = {
      id: 'target-1',
      projectId: 'project-1',
      storage: { type: DataStorageType.GOOGLE_BIGQUERY },
    };
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
      softDeleteByIdAndProjectId: jest.fn().mockResolvedValue(undefined),
      findByProjectIdAndDefinitionType: jest.fn().mockResolvedValue([
        {
          // The deleted Data Mart's own reference must not count as an heir.
          id: 'target-1',
          definition: {
            connector: { source: { configuration: [{ _id: 'cfg-own', _secrets_id: 'cred-2' }] } },
          },
        },
        {
          id: 'dm-2',
          definition: {
            connector: { source: { configuration: [{ _id: 'cfg-x', _secrets_id: 'cred-1' }] } },
          },
        },
      ]),
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
      getSecretsByDataMart: jest.fn().mockResolvedValue([{ id: 'cred-1' }, { id: 'cred-2' }]),
      transferSecretsOwnership: jest.fn().mockResolvedValue(undefined),
      deleteSecretsByDataMart: jest.fn().mockResolvedValue(undefined),
    };
    const relationshipService = {
      deleteAllByDataMartId: jest.fn().mockResolvedValue(undefined),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    };
    const searchIndexInvalidation = {
      findInboundSourceDataMartIds: jest.fn().mockResolvedValue([]),
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

    // cred-1 is still referenced by dm-2, so it is handed over rather than
    // soft-deleted with the rest of target-1's records.
    expect(connectorSourceCredentialsService.transferSecretsOwnership).toHaveBeenCalledTimes(1);
    expect(connectorSourceCredentialsService.transferSecretsOwnership).toHaveBeenCalledWith(
      'cred-1',
      'dm-2',
      'cfg-x'
    );
    // cred-2 has no live referencer besides target-1 itself and falls through
    // to the ownership-scoped delete.
    expect(connectorSourceCredentialsService.deleteSecretsByDataMart).toHaveBeenCalledWith(
      'target-1'
    );
    expect(
      connectorSourceCredentialsService.transferSecretsOwnership.mock.invocationCallOrder[0]
    ).toBeLessThan(
      connectorSourceCredentialsService.deleteSecretsByDataMart.mock.invocationCallOrder[0]
    );
  });
});
