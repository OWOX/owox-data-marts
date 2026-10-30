import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { GetOwoxStorageUsageCommand } from '../dto/domain/get-owox-storage-usage.command';
import { ProjectPlanType } from '../enums/project-plan-type.enum';
import { OwoxStorageUsageReadException } from '../owox-storage/owox-storage.exceptions';
import { Action, EntityType } from '../services/access-decision';
import { GetOwoxStorageUsageService } from './get-owox-storage-usage.service';

const record = { storageId: 'storage-1', datasetId: 'owox_abc', projectId: 'proj-1' };
const usage = {
  plan: ProjectPlanType.FREE,
  usedBytes: 5,
  limitBytes: 100,
  tables: [{ name: 't', sizeBytes: 5, rowCount: 1 }],
};

function makeService(managed: unknown = record, canSee = true) {
  const dataStorageService = { getByProjectIdAndId: jest.fn().mockResolvedValue({}) };
  const accessDecisionService = { canAccess: jest.fn().mockResolvedValue(canSee) };
  const managedStorages = { findByStorageId: jest.fn().mockResolvedValue(managed) };
  const usageService = { getUsage: jest.fn().mockResolvedValue(usage) };
  const service = new GetOwoxStorageUsageService(
    dataStorageService as never,
    accessDecisionService as never,
    managedStorages as never,
    usageService as never
  );
  return { service, accessDecisionService, dataStorageService, usageService };
}

const command = new GetOwoxStorageUsageCommand('storage-1', 'proj-1', 'user-1', ['viewer']);

describe('GetOwoxStorageUsageService', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('checks SEE access on the storage', async () => {
    const { service, accessDecisionService } = makeService();

    await service.run(command);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      command.roles,
      EntityType.STORAGE,
      'storage-1',
      Action.SEE,
      'proj-1'
    );
  });

  it('returns usage for an OWOX Storage', async () => {
    const { service, usageService } = makeService();

    await expect(service.run(command)).resolves.toEqual(usage);
    expect(usageService.getUsage).toHaveBeenCalledWith(record);
  });

  it('refuses a storage of another project', async () => {
    const { service, dataStorageService, usageService } = makeService();
    dataStorageService.getByProjectIdAndId.mockRejectedValue(new NotFoundException());

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
    expect(usageService.getUsage).not.toHaveBeenCalled();
  });

  it('refuses a user who cannot see the storage', async () => {
    const { service, usageService } = makeService(record, false);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
    expect(usageService.getUsage).not.toHaveBeenCalled();
  });

  it('refuses a storage that is not an OWOX Storage', async () => {
    const { service, usageService } = makeService(null);

    await expect(service.run(command)).rejects.toThrow(
      new BusinessViolationException('This storage is not an OWOX Storage.')
    );
    expect(usageService.getUsage).not.toHaveBeenCalled();
  });

  it('turns a read failure into the usage-read refusal', async () => {
    const { service, usageService } = makeService();
    usageService.getUsage.mockRejectedValue(new Error('boom'));

    await expect(service.run(command)).rejects.toThrow(OwoxStorageUsageReadException);
  });
});
