jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UpdateDataStorageCommand } from '../dto/domain/update-data-storage.command';
import { UpdateDataStorageService } from './update-data-storage.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { StorageCredentialType } from '../enums/storage-credential-type.enum';
import { CopyCredentialService } from '../services/copy-credential.service';

describe('UpdateDataStorageService - credential copy (sourceStorageId)', () => {
  const projectId = 'proj-1';
  const targetId = 'storage-target';
  const sourceId = 'storage-source';

  const makeConfig = () => ({ dataset: 'ds' }) as never;

  const makeCommand = (
    overrides: {
      id?: string;
      credentials?: Record<string, string>;
      credentialId?: string | null;
      sourceStorageId?: string;
    } = {}
  ): UpdateDataStorageCommand => {
    return new UpdateDataStorageCommand(
      overrides.id ?? targetId,
      projectId,
      makeConfig(),
      'Target Storage',
      overrides.credentials as never,
      overrides.credentialId,
      overrides.sourceStorageId
    );
  };

  const makeTargetStorage = (
    overrides: {
      credentialId?: string | null;
      type?: DataStorageType;
      credential?: object | null;
    } = {}
  ) => ({
    id: targetId,
    type: overrides.type ?? DataStorageType.GOOGLE_BIGQUERY,
    projectId,
    credentialId: 'credentialId' in overrides ? overrides.credentialId : null,
    credential: 'credential' in overrides ? overrides.credential : null,
    config: makeConfig(),
    title: 'Target Storage',
  });

  interface FakeCred {
    id: string;
    type: StorageCredentialType;
    credentials: Record<string, string>;
    identity: Record<string, string> | null;
    expiresAt: Date | null;
  }

  const defaultCred: FakeCred = {
    id: 'cred-source',
    type: StorageCredentialType.GOOGLE_SERVICE_ACCOUNT,
    credentials: { private_key: 'secret', client_email: 'sa@proj.iam.gserviceaccount.com' },
    identity: { clientEmail: 'sa@proj.iam.gserviceaccount.com' },
    expiresAt: null,
  };

  const makeSourceStorage = (
    overrides: {
      credentialId?: string | null;
      type?: DataStorageType;
      credential?: FakeCred | null;
    } = {}
  ) => ({
    id: sourceId,
    type: overrides.type ?? DataStorageType.GOOGLE_BIGQUERY,
    projectId,
    credentialId: 'credentialId' in overrides ? overrides.credentialId : 'cred-source',
    credential: 'credential' in overrides ? overrides.credential : defaultCred,
  });

  const createService = () => {
    const dataStorageRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    const dataStorageService = {
      getByProjectIdAndId: jest.fn(),
    };
    const dataStorageMapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: targetId }),
    };
    const dataStorageAccessFacade = {
      verifyAccess: jest.fn().mockResolvedValue(undefined),
    };
    const dataStorageCredentialService = {
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };

    const copyCredentialService = new CopyCredentialService(
      dataStorageCredentialService as never,
      {} as never
    );

    const service = new UpdateDataStorageService(
      dataStorageRepository as never,
      dataStorageService as never,
      dataStorageMapper as never,
      dataStorageAccessFacade as never,
      dataStorageCredentialService as never,
      copyCredentialService
    );

    return {
      service,
      dataStorageRepository,
      dataStorageService,
      dataStorageMapper,
      dataStorageAccessFacade,
      dataStorageCredentialService,
    };
  };

  it('copies credential to target that has no existing credential (create called, credentialId assigned)', async () => {
    const { service, dataStorageRepository, dataStorageService, dataStorageCredentialService } =
      createService();

    const targetStorage = makeTargetStorage({ credentialId: null, credential: null });
    const sourceStorage = makeSourceStorage();
    const newCred = { id: 'cred-new' };

    dataStorageService.getByProjectIdAndId
      .mockResolvedValueOnce(targetStorage)
      .mockResolvedValueOnce(sourceStorage);
    dataStorageCredentialService.create.mockResolvedValue(newCred);
    dataStorageRepository.save.mockResolvedValue({ ...targetStorage, credentialId: 'cred-new' });

    const command = makeCommand({ sourceStorageId: sourceId });
    await service.run(command);

    expect(dataStorageCredentialService.create).toHaveBeenCalledWith({
      projectId,
      type: defaultCred.type,
      credentials: defaultCred.credentials,
      identity: defaultCred.identity,
      expiresAt: defaultCred.expiresAt,
    });
    expect(targetStorage.credentialId).toBe('cred-new');
    expect(dataStorageRepository.save).toHaveBeenCalled();
  });

  it('copies credential to target that already has credential (update called with same credentialId)', async () => {
    const { service, dataStorageRepository, dataStorageService, dataStorageCredentialService } =
      createService();

    const targetStorage = makeTargetStorage({ credentialId: 'cred-existing' });
    const sourceStorage = makeSourceStorage();

    dataStorageService.getByProjectIdAndId
      .mockResolvedValueOnce(targetStorage)
      .mockResolvedValueOnce(sourceStorage);
    dataStorageCredentialService.update.mockResolvedValue(undefined);
    dataStorageRepository.save.mockResolvedValue(targetStorage);

    const command = makeCommand({ sourceStorageId: sourceId });
    await service.run(command);

    expect(dataStorageCredentialService.update).toHaveBeenCalledWith('cred-existing', {
      type: defaultCred.type,
      credentials: defaultCred.credentials,
      identity: defaultCred.identity,
      expiresAt: defaultCred.expiresAt,
    });
    expect(dataStorageCredentialService.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when source type differs from target type', async () => {
    const { service, dataStorageService } = createService();

    const targetStorage = makeTargetStorage({ type: DataStorageType.GOOGLE_BIGQUERY });
    const sourceStorage = makeSourceStorage({ type: DataStorageType.SNOWFLAKE });

    dataStorageService.getByProjectIdAndId.mockImplementation((_projId: string, id: string) => {
      if (id === targetId) return Promise.resolve(targetStorage);
      if (id === sourceId) return Promise.resolve(sourceStorage);
      return Promise.reject(new NotFoundException('Not found'));
    });

    const command = makeCommand({ sourceStorageId: sourceId });

    await expect(service.run(command)).rejects.toThrow(/Cannot copy credentials/);
  });

  it('throws NotFoundException when source storage not found', async () => {
    const { service, dataStorageService } = createService();

    const targetStorage = makeTargetStorage();
    dataStorageService.getByProjectIdAndId.mockImplementation((_projId: string, id: string) => {
      if (id === targetId) return Promise.resolve(targetStorage);
      return Promise.reject(new NotFoundException('DataStorage not found'));
    });

    const command = makeCommand({ sourceStorageId: sourceId });

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when source storage has no credential', async () => {
    const { service, dataStorageService } = createService();

    const targetStorage = makeTargetStorage();
    const sourceStorage = makeSourceStorage({ credentialId: null, credential: null });

    dataStorageService.getByProjectIdAndId.mockImplementation((_projId: string, id: string) => {
      if (id === targetId) return Promise.resolve(targetStorage);
      if (id === sourceId) return Promise.resolve(sourceStorage);
      return Promise.reject(new NotFoundException('Not found'));
    });

    const command = makeCommand({ sourceStorageId: sourceId });

    await expect(service.run(command)).rejects.toThrow(/Source storage has no credentials to copy/);
  });

  it('throws BadRequestException when both sourceStorageId and credentials are provided', async () => {
    const { service, dataStorageService } = createService();

    dataStorageService.getByProjectIdAndId.mockResolvedValue(makeTargetStorage());

    const command = makeCommand({
      sourceStorageId: sourceId,
      credentials: { private_key: 'val' },
    });

    await expect(service.run(command)).rejects.toThrow(
      /Cannot provide both sourceStorageId and credentials/
    );
  });

  it('does NOT call verifyAccess when sourceStorageId is provided', async () => {
    const {
      service,
      dataStorageRepository,
      dataStorageService,
      dataStorageAccessFacade,
      dataStorageCredentialService,
    } = createService();

    const targetStorage = makeTargetStorage({ credentialId: 'cred-existing' });
    const sourceStorage = makeSourceStorage();

    dataStorageService.getByProjectIdAndId
      .mockResolvedValueOnce(targetStorage)
      .mockResolvedValueOnce(sourceStorage);
    dataStorageCredentialService.update.mockResolvedValue(undefined);
    dataStorageRepository.save.mockResolvedValue(targetStorage);

    const command = makeCommand({ sourceStorageId: sourceId });
    await service.run(command);

    expect(dataStorageAccessFacade.verifyAccess).not.toHaveBeenCalled();
  });

  it('copies OAuth credential including expiresAt field', async () => {
    const { service, dataStorageRepository, dataStorageService, dataStorageCredentialService } =
      createService();

    const expiresAt = new Date('2026-01-01T00:00:00Z');
    const oauthCred: FakeCred = {
      id: 'cred-oauth',
      type: StorageCredentialType.GOOGLE_OAUTH,
      credentials: { access_token: 'tok', refresh_token: 'ref' },
      identity: { email: 'user@example.com', name: 'Test User' },
      expiresAt,
    };
    const targetStorage = makeTargetStorage({ credentialId: null, credential: null });
    const sourceStorage = makeSourceStorage({ credential: oauthCred, credentialId: 'cred-oauth' });

    dataStorageService.getByProjectIdAndId
      .mockResolvedValueOnce(targetStorage)
      .mockResolvedValueOnce(sourceStorage);
    dataStorageCredentialService.create.mockResolvedValue({ id: 'cred-new-oauth' });
    dataStorageRepository.save.mockResolvedValue(targetStorage);

    const command = makeCommand({ sourceStorageId: sourceId });
    await service.run(command);

    expect(dataStorageCredentialService.create).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt })
    );
  });

  it('throws BadRequestException when both sourceStorageId and credentialId are provided', async () => {
    const { service, dataStorageService } = createService();

    dataStorageService.getByProjectIdAndId.mockResolvedValue(makeTargetStorage());

    const command = makeCommand({
      sourceStorageId: sourceId,
      credentialId: 'some-oauth-cred',
    });

    await expect(service.run(command)).rejects.toThrow(
      /Cannot provide both sourceStorageId and credentialId/
    );
  });
});
