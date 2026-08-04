import { PublishDataStorageDraftsCommand } from '../dto/domain/publish-data-storage-drafts.command';
import { PublishDataStorageDraftsService } from './publish-data-storage-drafts.service';

describe('PublishDataStorageDraftsService', () => {
  const createService = () => {
    const dataStorageService = {
      getByProjectIdAndId: jest.fn().mockResolvedValue({ id: 'storage-1' }),
    };
    const dataMartService = {
      findDraftsByStorage: jest.fn().mockResolvedValue([{ id: 'dm-1', title: 'My Draft' }]),
    };
    const publishDataMartService = {
      run: jest.fn().mockResolvedValue(undefined),
    };
    const schemaActualizeTriggerService = {
      createTrigger: jest.fn().mockResolvedValue(undefined),
    };
    const validateDataStorageAccessService = {
      run: jest.fn().mockResolvedValue({ valid: true }),
    };
    const idpProjectionsFacade = {
      getProjectForUser: jest.fn().mockResolvedValue({ roles: ['editor'] }),
    };

    const service = new PublishDataStorageDraftsService(
      dataStorageService as never,
      dataMartService as never,
      publishDataMartService as never,
      schemaActualizeTriggerService as never,
      validateDataStorageAccessService as never,
      idpProjectionsFacade as never
    );

    return {
      service,
      publishDataMartService,
      idpProjectionsFacade,
    };
  };

  it("publishes each draft with the publisher's current roles instead of an empty array", async () => {
    const { service, publishDataMartService, idpProjectionsFacade } = createService();

    const result = await service.run(
      new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1')
    );

    expect(idpProjectionsFacade.getProjectForUser).toHaveBeenCalledWith('user-1', 'project-1');
    expect(publishDataMartService.run).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ['editor'] })
    );
    expect(result.successCount).toBe(1);
    expect(result.failedCount).toBe(0);
  });

  it('counts a draft as failed (without throwing) and reports its id, title and reason', async () => {
    const { service, publishDataMartService } = createService();
    publishDataMartService.run.mockRejectedValue(new Error('DataMart has no definition'));

    const result = await service.run(
      new PublishDataStorageDraftsCommand('storage-1', 'project-1', 'user-1')
    );

    expect(result.successCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.failures).toEqual([
      { dataMartId: 'dm-1', title: 'My Draft', error: 'DataMart has no definition' },
    ]);
  });
});
