jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

import { ForbiddenException, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DeleteDataStorageCommand } from '../dto/domain/delete-data-storage.command';
import { DeleteDataStorageService } from './delete-data-storage.service';

const record = { storageId: 'storage-1', datasetId: 'owox_abc' };

function makeService(dataMarts: unknown[] = [], managed: unknown = null) {
  const dataStorageRepository = { softDelete: jest.fn().mockResolvedValue(undefined) };
  const dataStorageService = {
    getByProjectIdAndId: jest
      .fn()
      .mockResolvedValue({ id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY }),
  };
  const dataMartService = { findByStorage: jest.fn().mockResolvedValue(dataMarts) };
  const accessDecisionService = { canAccess: jest.fn().mockResolvedValue(true) };
  const storageCredentials = { deactivateStorage: jest.fn().mockResolvedValue(undefined) };
  const managedStorages = {
    findByStorageId: jest.fn().mockResolvedValue(managed),
    markDeleting: jest.fn().mockResolvedValue(true),
    setDeprovisionPending: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const engine = { deprovision: jest.fn().mockResolvedValue(undefined) };
  const service = new DeleteDataStorageService(
    dataStorageRepository as never,
    dataStorageService as never,
    dataMartService as never,
    accessDecisionService as never,
    storageCredentials as never,
    managedStorages as never,
    engine as never
  );
  return { service, dataStorageRepository, storageCredentials, managedStorages, engine };
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

  it('marks an OWOX Storage deleted, deprovisions it, then soft-deletes it and its record', async () => {
    const { service, dataStorageRepository, managedStorages, engine } = makeService([], record);

    await service.run(command);

    expect(managedStorages.markDeleting).toHaveBeenCalledWith('storage-1', expect.any(Date));
    expect(engine.deprovision).toHaveBeenCalledWith(record);
    expect(dataStorageRepository.softDelete).toHaveBeenCalled();
    expect(managedStorages.remove).toHaveBeenCalledWith('storage-1');
    expect(managedStorages.setDeprovisionPending).not.toHaveBeenCalled();
    expect(managedStorages.markDeleting.mock.invocationCallOrder[0]).toBeLessThan(
      engine.deprovision.mock.invocationCallOrder[0]
    );
    expect(engine.deprovision.mock.invocationCallOrder[0]).toBeLessThan(
      dataStorageRepository.softDelete.mock.invocationCallOrder[0]
    );
  });

  it('still deprovisions and removes an OWOX Storage that is already deleted', async () => {
    const { service, managedStorages, engine } = makeService([], record);
    managedStorages.markDeleting.mockResolvedValue(false);

    await service.run(command);

    expect(engine.deprovision).toHaveBeenCalledWith(record);
    expect(managedStorages.remove).toHaveBeenCalledWith('storage-1');
  });

  it('refuses an OWOX Storage used by Data Marts without deprovisioning', async () => {
    const { service, engine, managedStorages } = makeService([{ id: 'mart-1' }], record);

    await expect(service.run(command)).rejects.toThrow(BusinessViolationException);
    expect(managedStorages.markDeleting).not.toHaveBeenCalled();
    expect(engine.deprovision).not.toHaveBeenCalled();
    expect(managedStorages.remove).not.toHaveBeenCalled();
  });

  it('keeps the storage deleted and pending when deprovisioning fails', async () => {
    const { service, engine, dataStorageRepository, storageCredentials, managedStorages } =
      makeService([], record);
    engine.deprovision.mockRejectedValue(new Error('boom'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(service.run(command)).rejects.toThrow(
      'OWOX Storage could not be deleted. Try again later.'
    );
    expect(managedStorages.setDeprovisionPending).toHaveBeenCalledWith('storage-1', true);
    expect(dataStorageRepository.softDelete).not.toHaveBeenCalled();
    expect(storageCredentials.deactivateStorage).not.toHaveBeenCalled();
    expect(managedStorages.remove).not.toHaveBeenCalled();
  });

  it('still refuses the delete when the pending flag cannot be set', async () => {
    const { service, engine, managedStorages } = makeService([], record);
    engine.deprovision.mockRejectedValue(new Error('boom'));
    managedStorages.setDeprovisionPending.mockRejectedValue(new Error('db down'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await expect(service.run(command)).rejects.toThrow(BusinessViolationException);
    expect(warn).toHaveBeenCalled();
  });

  describe('when a plugin deletes', () => {
    const pluginCommand = new DeleteDataStorageCommand('storage-1', 'proj-1', '', [], true);

    it('refuses an OWOX Storage before marking, deprovisioning or deleting it', async () => {
      const { service, dataStorageRepository, managedStorages, engine } = makeService([], record);

      await expect(service.run(pluginCommand)).rejects.toThrow(ForbiddenException);
      expect(managedStorages.markDeleting).not.toHaveBeenCalled();
      expect(engine.deprovision).not.toHaveBeenCalled();
      expect(dataStorageRepository.softDelete).not.toHaveBeenCalled();
      expect(managedStorages.remove).not.toHaveBeenCalled();
    });

    it('still deletes a storage that is not an OWOX Storage', async () => {
      const { service, dataStorageRepository } = makeService();

      await service.run(pluginCommand);

      expect(dataStorageRepository.softDelete).toHaveBeenCalled();
    });
  });
});
