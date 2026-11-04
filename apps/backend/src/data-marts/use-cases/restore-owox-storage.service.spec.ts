jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { ForbiddenException, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { RestoreOwoxStorageCommand } from '../dto/domain/restore-owox-storage.command';
import { ProjectPlanType } from '../enums/project-plan-type.enum';
import { OwoxStorageRestoreException } from '../owox-storage/owox-storage.exceptions';
import { Action, EntityType } from '../services/access-decision';
import { RestoreOwoxStorageService } from './restore-owox-storage.service';

const NOW = new Date('2026-11-02T10:00:00Z');
const storage = { id: 'storage-1' };
const deletedRecord = () => ({
  storageId: 'storage-1',
  datasetId: 'owox_abc',
  serviceAccountEmail: 'owox-st-abc@sa-project.iam.gserviceaccount.com',
  deprovisionedAt: new Date('2026-10-01T03:00:00Z'),
  deprovisionPending: false,
  notPaidSince: new Date('2026-08-30T03:00:00Z'),
  lastActivityAt: new Date('2026-08-01T00:00:00Z'),
});

function makeService({
  record = deletedRecord() as unknown,
  canEdit = true,
  plan = ProjectPlanType.FREE,
} = {}) {
  const dataStorageService = { getByProjectIdAndId: jest.fn().mockResolvedValue(storage) };
  const accessDecisionService = { canAccess: jest.fn().mockResolvedValue(canEdit) };
  const managedStorages = {
    findByStorageId: jest.fn().mockResolvedValue(record),
    markRestored: jest.fn().mockResolvedValue(true),
    setDeprovisionPending: jest.fn().mockResolvedValue(undefined),
  };
  const engine = {
    restore: jest.fn().mockResolvedValue(undefined),
    deprovision: jest.fn().mockResolvedValue(undefined),
  };
  const billing = { getBalance: jest.fn().mockResolvedValue({ subscriptionPlanType: plan }) };
  const dataMartService = {
    findByStorage: jest.fn().mockResolvedValue([{ id: 'dm-1' }, { id: 'dm-2' }]),
  };
  const connectorStates = { deleteByDataMartIds: jest.fn().mockResolvedValue(undefined) };
  const service = new RestoreOwoxStorageService(
    dataStorageService as never,
    accessDecisionService as never,
    managedStorages as never,
    engine as never,
    billing as never,
    dataMartService as never,
    connectorStates as never
  );
  return {
    service,
    dataStorageService,
    accessDecisionService,
    managedStorages,
    engine,
    billing,
    dataMartService,
    connectorStates,
  };
}

const command = new RestoreOwoxStorageCommand('storage-1', 'proj-1', 'user-1', ['editor']);

describe('RestoreOwoxStorageService', () => {
  let logs: string[];
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    logs = [];
    for (const level of ['log', 'error'] as const) {
      jest
        .spyOn(Logger.prototype, level)
        .mockImplementation((m: unknown) => void logs.push(String(m)));
    }
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('refuses a plugin before any lookup', async () => {
    const s = makeService();

    await expect(
      s.service.run(
        new RestoreOwoxStorageCommand('storage-1', 'proj-1', 'user-1', ['editor'], true)
      )
    ).rejects.toThrow(new ForbiddenException('Plugins cannot restore an OWOX Storage.'));
    expect(s.dataStorageService.getByProjectIdAndId).not.toHaveBeenCalled();
    expect(s.engine.restore).not.toHaveBeenCalled();
  });

  it('checks EDIT access on the storage and refuses without it', async () => {
    const s = makeService({ canEdit: false });

    await expect(s.service.run(command)).rejects.toThrow(ForbiddenException);
    expect(s.dataStorageService.getByProjectIdAndId).toHaveBeenCalledWith('proj-1', 'storage-1');
    expect(s.accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.STORAGE,
      'storage-1',
      Action.EDIT,
      'proj-1'
    );
    expect(s.engine.restore).not.toHaveBeenCalled();
  });

  it('refuses a storage that is not an OWOX Storage', async () => {
    const s = makeService({ record: null });

    await expect(s.service.run(command)).rejects.toThrow(
      new BusinessViolationException('This storage is not an OWOX Storage.')
    );
    expect(s.engine.restore).not.toHaveBeenCalled();
  });

  it('does nothing for a storage that is not deleted', async () => {
    const s = makeService({ record: { ...deletedRecord(), deprovisionedAt: null } });

    await expect(s.service.run(command)).resolves.toBeUndefined();
    expect(s.engine.restore).not.toHaveBeenCalled();
    expect(s.managedStorages.setDeprovisionPending).not.toHaveBeenCalled();
    expect(s.managedStorages.markRestored).not.toHaveBeenCalled();
    expect(s.connectorStates.deleteByDataMartIds).not.toHaveBeenCalled();
  });

  it('refuses a NOT_PAID project before any engine call', async () => {
    const s = makeService({ plan: ProjectPlanType.NOT_PAID });

    await expect(s.service.run(command)).rejects.toThrow(
      new BusinessViolationException(
        "Pay for this project's subscription before restoring its OWOX Storage."
      )
    );
    expect(s.billing.getBalance).toHaveBeenCalledWith('proj-1');
    expect(s.engine.restore).not.toHaveBeenCalled();
  });

  it('restores the storage, clears its Data Marts connector states and marks it active', async () => {
    const record = deletedRecord();
    const s = makeService({ record });

    await s.service.run(command);

    expect(s.engine.restore).toHaveBeenCalledWith(record, 'proj-1');
    expect(s.dataMartService.findByStorage).toHaveBeenCalledWith(storage);
    expect(s.managedStorages.markRestored).toHaveBeenCalledWith('storage-1', NOW);
    expect(s.connectorStates.deleteByDataMartIds).toHaveBeenCalledWith(['dm-1', 'dm-2']);
    expect(s.managedStorages.markRestored.mock.invocationCallOrder[0]).toBeLessThan(
      s.connectorStates.deleteByDataMartIds.mock.invocationCallOrder[0]
    );
    expect(logs).toContain('OWOX Storage owox_abc restored');
  });

  it('restores a deleted storage whose deletion left Google resources, clearing its pending flag first', async () => {
    const record = { ...deletedRecord(), deprovisionPending: true };
    const s = makeService({ record });

    await s.service.run(command);

    expect(s.managedStorages.setDeprovisionPending.mock.calls).toEqual([['storage-1', false]]);
    expect(s.managedStorages.setDeprovisionPending.mock.invocationCallOrder[0]).toBeLessThan(
      s.engine.restore.mock.invocationCallOrder[0]
    );
    expect(s.engine.restore).toHaveBeenCalledWith(record, 'proj-1');
    expect(s.managedStorages.markRestored).toHaveBeenCalledWith('storage-1', NOW);
  });

  it('changes nothing when a concurrent restore already cleared the record', async () => {
    const s = makeService();
    s.managedStorages.markRestored.mockResolvedValue(false);
    s.managedStorages.findByStorageId.mockResolvedValueOnce(deletedRecord()).mockResolvedValueOnce({
      ...deletedRecord(),
      deprovisionedAt: null,
    });

    await expect(s.service.run(command)).resolves.toBeUndefined();
    expect(s.connectorStates.deleteByDataMartIds).not.toHaveBeenCalled();
    expect(s.engine.deprovision).not.toHaveBeenCalled();
  });

  it('deletes what it created when the storage was deleted during the restore', async () => {
    const record = deletedRecord();
    const s = makeService({ record });
    s.managedStorages.markRestored.mockResolvedValue(false);
    s.managedStorages.findByStorageId.mockResolvedValueOnce(record).mockResolvedValueOnce(null);

    await expect(s.service.run(command)).resolves.toBeUndefined();
    expect(s.engine.deprovision).toHaveBeenCalledWith(record);
    expect(s.connectorStates.deleteByDataMartIds).not.toHaveBeenCalled();
    expect(logs).not.toContain('OWOX Storage owox_abc restored');
  });

  it('logs, and does not throw, when it cannot delete what it created for a deleted storage', async () => {
    const s = makeService();
    s.managedStorages.markRestored.mockResolvedValue(false);
    s.managedStorages.findByStorageId
      .mockResolvedValueOnce(deletedRecord())
      .mockResolvedValueOnce(null);
    s.engine.deprovision.mockRejectedValue(
      Object.assign(new Error('owox-st-abc@sa-project.iam.gserviceaccount.com'), { code: 500 })
    );

    await expect(s.service.run(command)).resolves.toBeUndefined();
    expect(
      logs.some(line => line.startsWith('OWOX Storage owox_abc') && line.includes('code 500'))
    ).toBe(true);
    for (const line of logs) expect(line).not.toContain('@');
  });

  it('turns an engine failure into the restore refusal and keeps the record deleted', async () => {
    const s = makeService();
    s.engine.restore.mockRejectedValue(
      Object.assign(new Error('denied for owox-st-abc@sa-project.iam.gserviceaccount.com'), {
        code: 403,
      })
    );

    await expect(s.service.run(command)).rejects.toThrow(OwoxStorageRestoreException);
    expect(s.managedStorages.setDeprovisionPending.mock.calls).toEqual([
      ['storage-1', false],
      ['storage-1', true],
    ]);
    expect(s.connectorStates.deleteByDataMartIds).not.toHaveBeenCalled();
    expect(s.managedStorages.markRestored).not.toHaveBeenCalled();
    for (const line of logs) expect(line).not.toContain('@');
  });

  it('still refuses the restore when the pending flag cannot be set back', async () => {
    const s = makeService();
    s.engine.restore.mockRejectedValue(new Error('restore failed'));
    s.managedStorages.setDeprovisionPending
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('db down'));

    await expect(s.service.run(command)).rejects.toThrow(OwoxStorageRestoreException);
    expect(logs.some(line => line.startsWith('OWOX Storage owox_abc'))).toBe(true);
  });
});
