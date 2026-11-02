jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { ForbiddenException, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { CreateOwoxStorageCommand } from '../dto/domain/create-owox-storage.command';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { ProjectPlanType } from '../enums/project-plan-type.enum';
import { CreateOwoxStorageService } from './create-owox-storage.service';

describe('CreateOwoxStorageService', () => {
  const provisioned = {
    engine: 'bigquery' as const,
    gcpProjectId: 'owox-managed',
    location: 'EU' as const,
    datasetId: 'owox_abc',
    internalDatasetId: 'owox_abc_internal',
    serviceAccountEmail: 'owox-st-abc@owox-managed.iam.gserviceaccount.com',
  };
  const created = new DataStorageDto(
    'st-1',
    'BigQuery',
    DataStorageType.GOOGLE_BIGQUERY,
    'p1',
    undefined,
    new Date(),
    new Date()
  );
  const command = new CreateOwoxStorageCommand('p1', 'Mine', 'EU', 'u1', false, ['u1']);

  function setup(plan = ProjectPlanType.FREE) {
    const configService = { getSettings: jest.fn() };
    const billing = { getBalance: jest.fn().mockResolvedValue({ subscriptionPlanType: plan }) };
    const managed = {
      findByProjectId: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    };
    const engine = {
      provision: jest.fn().mockResolvedValue(provisioned),
      deprovision: jest.fn().mockResolvedValue(undefined),
    };
    const createDataStorage = { run: jest.fn().mockResolvedValue(created) };
    const repo = { update: jest.fn().mockResolvedValue(undefined) };
    const idp = {
      getProjectMembers: jest.fn().mockResolvedValue([{ userId: 'u1', isOutbound: false }]),
    };
    const service = new CreateOwoxStorageService(
      configService as never,
      billing as never,
      managed as never,
      engine as never,
      createDataStorage as never,
      repo as never,
      idp as never
    );
    return { service, configService, billing, managed, engine, createDataStorage, repo, idp };
  }

  it('creates the storage, its record and returns owoxStorage', async () => {
    const s = setup();
    const dto = await s.service.run(command);
    expect(s.engine.provision).toHaveBeenCalledWith({ projectId: 'p1', location: 'EU' });
    expect(s.createDataStorage.run).toHaveBeenCalledWith({
      type: DataStorageType.GOOGLE_BIGQUERY,
      projectId: 'p1',
      userId: 'u1',
      ownerIds: ['u1'],
    });
    expect(s.repo.update).toHaveBeenCalledWith('st-1', {
      title: 'Mine',
      config: { projectId: 'owox-managed', location: 'EU' },
    });
    expect(s.managed.create).toHaveBeenCalledWith({
      storageId: 'st-1',
      projectId: 'p1',
      ...provisioned,
      storageLimitBytes: null,
      queryLimitBytesPerDay: null,
      notPaidSince: null,
      lastActivityAt: null,
      deprovisionedAt: null,
    });
    expect(dto.title).toBe('Mine');
    expect(dto.config).toEqual({ projectId: 'owox-managed', location: 'EU' });
  });

  it('refuses a plugin token', async () => {
    const s = setup();
    await expect(
      s.service.run(new CreateOwoxStorageCommand('p1', 'Mine', 'EU', 'u1', true))
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.engine.provision).not.toHaveBeenCalled();
  });

  it('refuses NOT_PAID before provisioning', async () => {
    const s = setup(ProjectPlanType.NOT_PAID);
    await expect(s.service.run(command)).rejects.toThrow(
      'A project with an unpaid subscription cannot create an OWOX Storage.'
    );
    expect(s.engine.provision).not.toHaveBeenCalled();
  });

  it('refuses when the plan cannot be read', async () => {
    const s = setup();
    s.billing.getBalance.mockRejectedValue(new Error('balance down'));
    await expect(s.service.run(command)).rejects.toThrow('balance down');
    expect(s.engine.provision).not.toHaveBeenCalled();
  });

  it('refuses an owner who is not a project member before provisioning', async () => {
    const s = setup();
    await expect(
      s.service.run(new CreateOwoxStorageCommand('p1', 'Mine', 'EU', 'u1', false, ['u1', 'x9']))
    ).rejects.toThrow('not members of this project: x9');
    expect(s.engine.provision).not.toHaveBeenCalled();
  });

  it('refuses a second OWOX Storage before provisioning', async () => {
    const s = setup();
    s.managed.findByProjectId.mockResolvedValue({ storageId: 'x' });
    await expect(s.service.run(command)).rejects.toThrow(
      'This project already has an OWOX Storage.'
    );
    expect(s.engine.provision).not.toHaveBeenCalled();
  });

  it('refuses when OWOX Storage is not configured', async () => {
    const s = setup();
    s.configService.getSettings.mockImplementation(() => {
      throw new BusinessViolationException('OWOX Storage is not available on this deployment.');
    });
    await expect(s.service.run(command)).rejects.toThrow(
      'OWOX Storage is not available on this deployment.'
    );
    expect(s.engine.provision).not.toHaveBeenCalled();
  });

  it('deprovisions when saving fails', async () => {
    const s = setup();
    const boom = new Error('db down');
    s.managed.create.mockRejectedValue(boom);
    await expect(s.service.run(command)).rejects.toBe(boom);
    expect(s.engine.deprovision).toHaveBeenCalledWith(provisioned);
  });

  it('keeps the original error when deprovisioning fails too', async () => {
    const s = setup();
    const boom = new Error('db down');
    s.managed.create.mockRejectedValue(boom);
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    s.engine.deprovision.mockRejectedValue(
      Object.assign(new Error(`gcp down ${provisioned.serviceAccountEmail}`), { code: 403 })
    );
    await expect(s.service.run(command)).rejects.toBe(boom);
    const line = String(log.mock.calls[0][0]);
    expect(line).toContain(provisioned.datasetId);
    expect(line).toContain('code 403');
    expect(line).not.toContain(provisioned.serviceAccountEmail);
    expect(line).not.toContain('owox-managed');
    log.mockRestore();
  });

  it('turns a concurrent duplicate into the already-has refusal', async () => {
    const s = setup();
    s.managed.create.mockRejectedValue(
      new QueryFailedError('INSERT', [], { code: 'ER_DUP_ENTRY' } as never)
    );
    await expect(s.service.run(command)).rejects.toThrow(
      'This project already has an OWOX Storage.'
    );
    expect(s.engine.deprovision).toHaveBeenCalledWith(provisioned);
  });
});
