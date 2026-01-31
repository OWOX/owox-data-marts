import { SyncLegacyDataMartService } from './sync-legacy-data-mart.service';
import { SyncLegacyDataMartsByProjectService } from './sync-legacy-data-marts-by-project.service';
import { LegacyDataMartsService } from '../../services/legacy-data-marts.service';
import { DataStorageService } from '../../services/data-storage.service';
import { DataMartService } from '../../services/data-mart.service';
import { SyncLegacyDataMartsByProjectCommand } from '../../dto/domain/sync-legacy-data-marts-by-project.command';

jest.mock('@owox/internal-helpers', () => ({
  fetchWithBackoff: jest.fn(),
  ImpersonatedIdTokenFetcher: class {
    getIdToken = jest.fn().mockResolvedValue('token');
  },
}));

describe('SyncLegacyDataMartsByProjectService', () => {
  const legacyDataMartsService = {
    getDataMartsList: jest.fn(),
  } as unknown as LegacyDataMartsService;
  const dataStorageService = {
    getOrCreateLegacyStorage: jest.fn(),
  } as unknown as DataStorageService;
  const dataMartService = {
    softDeleteByStorageIdAndProjectId: jest.fn(),
  } as unknown as DataMartService;
  const syncLegacyDataMartService = {
    run: jest.fn(),
  } as unknown as SyncLegacyDataMartService;

  const createService = () =>
    new SyncLegacyDataMartsByProjectService(
      legacyDataMartsService,
      syncLegacyDataMartService,
      dataStorageService,
      dataMartService
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses one storage for batch sync', async () => {
    const service = createService();
    const storage = { id: 'storage-id' };
    dataStorageService.getOrCreateLegacyStorage = jest.fn().mockResolvedValue(storage);
    legacyDataMartsService.getDataMartsList = jest
      .fn()
      .mockResolvedValue([{ id: 'dm-1' }, { id: 'dm-2' }]);
    syncLegacyDataMartService.run = jest
      .fn()
      .mockResolvedValueOnce({ id: 'dm-1' })
      .mockResolvedValueOnce({ id: 'dm-2' });
    const result = await service.run(new SyncLegacyDataMartsByProjectCommand('project-id', 'gcp'));

    expect(dataStorageService.getOrCreateLegacyStorage).toHaveBeenCalledWith('project-id', 'gcp');
    expect(dataMartService.softDeleteByStorageIdAndProjectId).toHaveBeenCalledWith(
      'storage-id',
      'project-id'
    );
    expect(syncLegacyDataMartService.run).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ dataMartId: 'dm-1', storage })
    );
    expect(syncLegacyDataMartService.run).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ dataMartId: 'dm-2', storage })
    );
    expect(result).toEqual([{ id: 'dm-1' }, { id: 'dm-2' }]);
  });

  it('soft deletes data marts by storage before syncing', async () => {
    const service = createService();
    const storage = { id: 'storage-id' };
    dataStorageService.getOrCreateLegacyStorage = jest.fn().mockResolvedValue(storage);
    legacyDataMartsService.getDataMartsList = jest.fn().mockResolvedValue([{ id: 'dm-1' }]);
    syncLegacyDataMartService.run = jest.fn().mockResolvedValue({ id: 'dm-1' });

    await service.run(new SyncLegacyDataMartsByProjectCommand('project-id', 'gcp'));

    expect(dataMartService.softDeleteByStorageIdAndProjectId).toHaveBeenCalledWith(
      'storage-id',
      'project-id'
    );
  });
});
