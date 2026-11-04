import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DeleteOwoxStorageTableCommand } from '../dto/domain/delete-owox-storage-table.command';
import { OwoxStorageTableDeleteException } from '../owox-storage/owox-storage.exceptions';
import { Action, EntityType } from '../services/access-decision';
import { DeleteOwoxStorageTableService } from './delete-owox-storage-table.service';

const record = {
  storageId: 'storage-1',
  datasetId: 'owox_abc',
  serviceAccountEmail: 'sa-secret@proj.iam.gserviceaccount.com',
};

function makeService(managed: unknown = record, canEdit = true) {
  const dataStorageService = { getByProjectIdAndId: jest.fn().mockResolvedValue({}) };
  const accessDecisionService = { canAccess: jest.fn().mockResolvedValue(canEdit) };
  const managedStorages = { findByStorageId: jest.fn().mockResolvedValue(managed) };
  const engine = { dropTable: jest.fn().mockResolvedValue(undefined) };
  const usage = { forgetTables: jest.fn() };
  const service = new DeleteOwoxStorageTableService(
    dataStorageService as never,
    accessDecisionService as never,
    managedStorages as never,
    usage as never,
    engine as never
  );
  return { service, accessDecisionService, dataStorageService, engine, usage };
}

const command = new DeleteOwoxStorageTableCommand('storage-1', 'proj-1', 'events', 'user-1', [
  'editor',
]);

describe('DeleteOwoxStorageTableService', () => {
  let errorLog: jest.SpyInstance;
  beforeEach(() => {
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('checks EDIT access on the storage', async () => {
    const { service, accessDecisionService } = makeService();

    await service.run(command);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      command.roles,
      EntityType.STORAGE,
      'storage-1',
      Action.EDIT,
      'proj-1'
    );
  });

  it('drops the table', async () => {
    const { service, engine } = makeService();

    await service.run(command);

    expect(engine.dropTable).toHaveBeenCalledWith(record, 'events');
  });

  it('forgets the cached table list after a successful delete only', async () => {
    const ok = makeService();
    await ok.service.run(command);
    expect(ok.usage.forgetTables).toHaveBeenCalledWith('storage-1');

    const failed = makeService();
    failed.engine.dropTable.mockRejectedValue(new Error('boom'));
    await expect(failed.service.run(command)).rejects.toThrow(OwoxStorageTableDeleteException);
    expect(failed.usage.forgetTables).not.toHaveBeenCalled();
  });

  it('refuses a plugin token before any lookup', async () => {
    const { service, dataStorageService, engine } = makeService();
    const pluginCommand = new DeleteOwoxStorageTableCommand(
      'storage-1',
      'proj-1',
      'events',
      'user-1',
      ['editor'],
      true
    );

    await expect(service.run(pluginCommand)).rejects.toThrow(
      new ForbiddenException('Plugins cannot delete OWOX Storage tables.')
    );
    expect(dataStorageService.getByProjectIdAndId).not.toHaveBeenCalled();
    expect(engine.dropTable).not.toHaveBeenCalled();
  });

  it('refuses a user without edit rights on the storage', async () => {
    const { service, engine } = makeService(record, false);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
    expect(engine.dropTable).not.toHaveBeenCalled();
  });

  it('refuses a storage that is not an OWOX Storage', async () => {
    const { service, engine } = makeService(null);

    await expect(service.run(command)).rejects.toThrow(
      new BusinessViolationException('This storage is not an OWOX Storage.')
    );
    expect(engine.dropTable).not.toHaveBeenCalled();
  });

  it('refuses a deleted storage before any engine call', async () => {
    const { service, engine } = makeService({ ...record, deprovisionedAt: new Date() });

    await expect(service.run(command)).rejects.toThrow(
      new BusinessViolationException(
        'This OWOX Storage and its data were deleted. Restore the storage on its page to continue.'
      )
    );
    expect(engine.dropTable).not.toHaveBeenCalled();
  });

  it('passes not-found through', async () => {
    const { service, engine } = makeService();
    engine.dropTable.mockRejectedValue(new NotFoundException('Table x was not found.'));

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
  });

  it('turns a Google error into the delete refusal and logs the dataset, not the account', async () => {
    const { service, engine } = makeService();
    engine.dropTable.mockRejectedValue(
      Object.assign(new Error(`denied for ${record.serviceAccountEmail}`), { code: 403 })
    );

    await expect(service.run(command)).rejects.toThrow(OwoxStorageTableDeleteException);

    const logged = String(errorLog.mock.calls[0][0]);
    expect(logged).toContain('owox_abc');
    expect(logged).not.toContain('sa-secret');
  });
});
