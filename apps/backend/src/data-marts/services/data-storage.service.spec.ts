import { v5 as uuidv5 } from 'uuid';
import { BIGQUERY_AUTODETECT_LOCATION } from '../data-storage-types/bigquery/schemas/bigquery-config.schema';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageService } from './data-storage.service';

const LEGACY_DATA_STORAGE_ID_NAMESPACE = 'c6b09b4f-6fa4-4e6e-bb1a-4bfe94e50b7f';

describe('DataStorageService', () => {
  const dataStorageRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const createService = () => new DataStorageService(dataStorageRepository as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reuses existing legacy storage by uuidv5 id', async () => {
    const service = createService();
    const storage = { id: 'existing-id', projectId: 'project-id' };
    dataStorageRepository.findOne.mockResolvedValue(storage);

    const result = await service.getOrCreateLegacyStorage('project-id', 'gcp-id');

    const expectedId = uuidv5('gcp-id', LEGACY_DATA_STORAGE_ID_NAMESPACE);
    expect(dataStorageRepository.findOne).toHaveBeenCalledWith({ where: { id: expectedId } });
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
    expect(result).toBe(storage);
  });

  it('throws when existing legacy storage belongs to another project', async () => {
    const service = createService();
    dataStorageRepository.findOne.mockResolvedValue({
      id: 'existing-id',
      projectId: 'another-project',
    });

    await expect(service.getOrCreateLegacyStorage('project-id', 'gcp-id')).rejects.toThrow(
      'Legacy data storage for gcp-id already exists for project another-project'
    );
  });

  it('creates legacy storage when missing', async () => {
    const service = createService();
    dataStorageRepository.findOne.mockResolvedValue(null);
    dataStorageRepository.create.mockImplementation(storage => storage);
    dataStorageRepository.save.mockImplementation(storage => storage);

    const result = await service.getOrCreateLegacyStorage('project-id', 'gcp-id');

    const expectedId = uuidv5('gcp-id', LEGACY_DATA_STORAGE_ID_NAMESPACE);
    expect(dataStorageRepository.create).toHaveBeenCalledWith({
      id: expectedId,
      type: DataStorageType.LEGACY_GOOGLE_BIGQUERY,
      projectId: 'project-id',
      config: {
        projectId: 'gcp-id',
        location: BIGQUERY_AUTODETECT_LOCATION,
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: expectedId,
        type: DataStorageType.LEGACY_GOOGLE_BIGQUERY,
      })
    );
  });
});
