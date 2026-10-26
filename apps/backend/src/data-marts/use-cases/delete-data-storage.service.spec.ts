jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DeleteDataStorageCommand } from '../dto/domain/delete-data-storage.command';
import { DeleteDataStorageService } from './delete-data-storage.service';

function makeService(dataMarts: unknown[] = []) {
  const dataStorageRepository = { softDelete: jest.fn().mockResolvedValue(undefined) };
  const dataStorageService = {
    getByProjectIdAndId: jest
      .fn()
      .mockResolvedValue({ id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY }),
  };
  const dataMartService = { findByStorage: jest.fn().mockResolvedValue(dataMarts) };
  const accessDecisionService = { canAccess: jest.fn().mockResolvedValue(true) };
  const storageCredentials = { deactivateStorage: jest.fn().mockResolvedValue(undefined) };
  const service = new DeleteDataStorageService(
    dataStorageRepository as never,
    dataStorageService as never,
    dataMartService as never,
    accessDecisionService as never,
    storageCredentials as never
  );
  return { service, dataStorageRepository, storageCredentials };
}

const command = new DeleteDataStorageCommand('storage-1', 'proj-1', 'user-1', ['editor']);

describe('DeleteDataStorageService', () => {
  it('deactivates the binding of a deleted Storage', async () => {
    const { service, dataStorageRepository, storageCredentials } = makeService();

    await service.run(command);

    expect(dataStorageRepository.softDelete).toHaveBeenCalledWith({
      id: 'storage-1',
      projectId: 'proj-1',
    });
    expect(storageCredentials.deactivateStorage).toHaveBeenCalledWith('storage-1');
  });

  it('keeps the binding when the Storage cannot be deleted', async () => {
    const { service, storageCredentials } = makeService([{ id: 'mart-1' }]);

    await expect(service.run(command)).rejects.toThrow(BusinessViolationException);
    expect(storageCredentials.deactivateStorage).not.toHaveBeenCalled();
  });
});
