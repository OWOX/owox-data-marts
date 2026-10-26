import { Logger } from '@nestjs/common';
import { DataSource, type Repository } from 'typeorm';
import {
  addTransactionalDataSource,
  deleteDataSourceByName,
  initializeTransactionalContext,
  StorageDriver,
} from 'typeorm-transactional';
import { CredentialConsumerBinding } from '../credentials/entities/credential-consumer-binding.entity';
import { CredentialContext } from '../credentials/entities/credential-context.entity';
import { CredentialOwner } from '../credentials/entities/credential-owner.entity';
import { Credential } from '../credentials/entities/credential.entity';
import { CredentialBindingService } from '../credentials/services/credential-binding.service';
import { CredentialDefinitionService } from '../credentials/services/credential-definition.service';
import { CredentialService } from '../credentials/services/credential.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { StorageCredentialBindingService } from '../data-storage-types/storage-credential-binding.service';
import { DeleteDataStorageCommand } from '../dto/domain/delete-data-storage.command';
import { ConnectorRunTrigger } from '../entities/connector-run-trigger.entity';
import { ConnectorState } from '../entities/connector-state.entity';
import { Context } from '../entities/context.entity';
import { DataDestinationCredential } from '../entities/data-destination-credential.entity';
import { DataDestination } from '../entities/data-destination.entity';
import { DataMartBusinessOwner } from '../entities/data-mart-business-owner.entity';
import { DataMartContext } from '../entities/data-mart-context.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { DataMartTechnicalOwner } from '../entities/data-mart-technical-owner.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataStorageCredential } from '../entities/data-storage-credential.entity';
import { DataStorage } from '../entities/data-storage.entity';
import { DestinationContext } from '../entities/destination-context.entity';
import { DestinationOwner } from '../entities/destination-owner.entity';
import { ReportDataCache } from '../entities/report-data-cache.entity';
import { ReportOwner } from '../entities/report-owner.entity';
import { ReportRunTrigger } from '../entities/report-run-trigger.entity';
import { Report } from '../entities/report.entity';
import { StorageContext } from '../entities/storage-context.entity';
import { StorageOwner } from '../entities/storage-owner.entity';
import { StorageCredentialType } from '../enums/storage-credential-type.enum';
import { DataStorageService } from '../services/data-storage.service';
import { LegacyStorageCredentialReader } from '../services/storage-credential-conversion/legacy-storage-credential-reader.service';
import { DeleteDataStorageService } from './delete-data-storage.service';
import { MoveLegacyDataStorageService } from './legacy-data-marts/move-legacy-data-storage.service';

const PROJECT = 'project-1';

describe('Storage writes that span its binding', () => {
  let dataSource: DataSource;
  let storages: Repository<DataStorage>;
  let rows: Repository<DataStorageCredential>;
  let credentials: Repository<Credential>;
  let bindings: Repository<CredentialConsumerBinding>;
  let storageCredentials: StorageCredentialBindingService;
  let legacy: LegacyStorageCredentialReader;

  beforeAll(async () => {
    initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });
    dataSource = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [
        DataStorage,
        DataStorageCredential,
        StorageOwner,
        StorageContext,
        Context,
        Credential,
        CredentialOwner,
        CredentialContext,
        CredentialConsumerBinding,
        // What a legacy move touches.
        DataMart,
        ConnectorState,
        DataMartBusinessOwner,
        DataMartTechnicalOwner,
        DataMartContext,
        DataMartRun,
        DataMartScheduledTrigger,
        ConnectorRunTrigger,
        Report,
        ReportOwner,
        ReportRunTrigger,
        ReportDataCache,
        DataDestination,
        DataDestinationCredential,
        DestinationOwner,
        DestinationContext,
      ],
      synchronize: true,
      logging: false,
    }).initialize();
    addTransactionalDataSource(dataSource);
  });

  afterAll(async () => {
    deleteDataSourceByName('default');
    await dataSource.destroy();
  });

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    for (const entity of [
      CredentialConsumerBinding,
      CredentialOwner,
      Credential,
      DataMart,
      DataStorage,
      DataStorageCredential,
    ]) {
      await dataSource.getRepository(entity).createQueryBuilder().delete().execute();
    }
    storages = dataSource.getRepository(DataStorage);
    rows = dataSource.getRepository(DataStorageCredential);
    credentials = dataSource.getRepository(Credential);
    bindings = dataSource.getRepository(CredentialConsumerBinding);
    const credentialService = new CredentialService(
      credentials,
      bindings,
      dataSource.getRepository(CredentialOwner),
      dataSource.getRepository(CredentialContext),
      {} as never,
      {} as never
    );
    const binder = new CredentialBindingService(
      bindings,
      credentials,
      dataSource.getRepository(CredentialContext),
      {} as never,
      credentialService
    );
    storageCredentials = new StorageCredentialBindingService(
      binder,
      // Built-in definitions resolve without touching the external-definition tables.
      new CredentialDefinitionService({} as never, {} as never),
      {} as never,
      credentialService,
      {} as never,
      { isClientConfigured: () => true, getScopes: () => [] } as never
    );
    legacy = new LegacyStorageCredentialReader(storages, {} as never, {} as never, {} as never);
  });

  afterEach(() => jest.restoreAllMocks());

  /** An Athena Storage on an old key row, bound to a Credential as the conversion leaves it. */
  async function givenBoundStorage(credentialId?: string): Promise<{
    storageId: string;
    rowId: string;
    credentialId: string;
  }> {
    const row = await rows.save(
      rows.create({
        projectId: PROJECT,
        type: StorageCredentialType.AWS_IAM,
        credentials: { accessKeyId: 'AKIA1', secretAccessKey: 'secret' } as never,
      })
    );
    const storage = await storages.save(
      storages.create({
        projectId: PROJECT,
        type: DataStorageType.AWS_ATHENA,
        title: 'Athena',
        credentialId: row.id,
      })
    );
    const boundTo =
      credentialId ??
      (
        await credentials.save(
          credentials.create({
            projectId: PROJECT,
            title: 'AKIA1',
            definitionSource: 'builtin',
            definitionId: 'aws-access-key',
            secret: { fields: { secretAccessKey: 'secret' } },
            publicMetadata: { fields: { accessKeyId: 'AKIA1' } },
            availableForUse: false,
          })
        )
      ).id;
    await bindings.insert({
      projectId: PROJECT,
      credentialId: boundTo,
      consumerType: 'storage',
      consumerId: storage.id,
      requirementKey: 'storage',
      requirementSnapshot: { definitionIds: ['aws-access-key'], scopes: [] },
      requirementRevision: 'revision',
      configuredById: null,
      active: true,
    });
    return { storageId: storage.id, rowId: row.id, credentialId: boundTo };
  }

  function moveStorage(storageId: string): Promise<DataStorage> {
    const move = new MoveLegacyDataStorageService(
      { validateSyncPermissionForProject: jest.fn() } as never,
      dataSource,
      storageCredentials,
      legacy
    );
    return storages
      .findOneOrFail({ where: { id: storageId }, relations: { credential: true } })
      .then(storage => move.run(storage, 'project-2'));
  }

  async function boundCredential(storageId: string): Promise<Credential> {
    const binding = await bindings.findOneByOrFail({ consumerId: storageId, active: true });
    return credentials.findOneByOrFail({ id: binding.credentialId });
  }

  it('moves the Credential of a moved Storage that is its only binding', async () => {
    const { storageId, credentialId } = await givenBoundStorage();

    await moveStorage(storageId);

    await expect(boundCredential(storageId)).resolves.toMatchObject({
      id: credentialId,
      projectId: 'project-2',
    });
    await expect(bindings.findOneByOrFail({ consumerId: storageId })).resolves.toMatchObject({
      projectId: 'project-2',
    });
  });

  it('copies the Credential when another Storage still uses it', async () => {
    const moved = await givenBoundStorage();
    const kept = await givenBoundStorage(moved.credentialId);

    await moveStorage(moved.storageId);

    const copy = await boundCredential(moved.storageId);
    expect(copy).toMatchObject({ projectId: 'project-2' });
    expect(copy.id).not.toBe(moved.credentialId);
    await expect(boundCredential(kept.storageId)).resolves.toMatchObject({
      id: moved.credentialId,
      projectId: PROJECT,
    });
  });

  it('rolls the Storage move back when the Credential move fails', async () => {
    const { storageId, rowId } = await givenBoundStorage();
    const marts = dataSource.getRepository(DataMart);
    await marts.insert({
      title: 'Mart',
      projectId: PROJECT,
      createdById: 'editor-1',
      storage: { id: storageId },
    });
    jest
      .spyOn(storageCredentials, 'moveStorageCredential')
      .mockRejectedValue(new Error('move failed'));

    await expect(moveStorage(storageId)).rejects.toThrow('move failed');

    await expect(storages.findOneByOrFail({ id: storageId })).resolves.toMatchObject({
      projectId: PROJECT,
    });
    expect((await marts.find()).map(mart => mart.projectId)).toEqual([PROJECT]);
    await expect(rows.findOneByOrFail({ id: rowId })).resolves.toMatchObject({
      projectId: PROJECT,
    });
  });

  function deleteStorage(storageId: string): Promise<void> {
    return new DeleteDataStorageService(
      storages,
      new DataStorageService(storages),
      { findByStorage: async () => [] } as never,
      {} as never,
      storageCredentials
    ).run(new DeleteDataStorageCommand(storageId, PROJECT));
  }

  it('deletes a Storage by deactivating its binding and keeps its Credential', async () => {
    const { storageId } = await givenBoundStorage();

    await deleteStorage(storageId);

    await expect(storages.findOneBy({ id: storageId })).resolves.toBeNull();
    await expect(bindings.findOneByOrFail({ consumerId: storageId })).resolves.toMatchObject({
      active: false,
    });
    await expect(credentials.count()).resolves.toBe(1);
  });

  it('keeps the Storage when deactivating its binding fails', async () => {
    const { storageId } = await givenBoundStorage();
    jest
      .spyOn(storageCredentials, 'deactivateStorage')
      .mockRejectedValue(new Error('deactivate failed'));

    await expect(deleteStorage(storageId)).rejects.toThrow('deactivate failed');

    await expect(storages.findOneBy({ id: storageId })).resolves.not.toBeNull();
    await expect(boundCredential(storageId)).resolves.toBeDefined();
  });
});
