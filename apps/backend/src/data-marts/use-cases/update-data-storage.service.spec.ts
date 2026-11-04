jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));

jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UpdateDataStorageCommand } from '../dto/domain/update-data-storage.command';
import { UpdateDataStorageService } from './update-data-storage.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { Action } from '../services/access-decision';
import type { StorageCredentialSummary } from '../data-storage-types/storage-credential-state';
import { StorageCredentialUnavailableException } from '../exceptions/storage-credential-unavailable.exception';
import { AccessValidationException } from '../../common/exceptions/access-validation.exception';
import { DatabricksConfigSchema } from '../data-storage-types/databricks/schemas/databricks-config.schema';
import { ValidationResult } from '../data-storage-types/interfaces/data-storage-access-validator.interface';
import { LegacyStorageCredentialReader } from '../services/storage-credential-conversion/legacy-storage-credential-reader.service';

const projectId = 'proj-1';
const storageId = 'storage-1';

function makeService() {
  const storage = {
    id: storageId,
    type: DataStorageType.GOOGLE_BIGQUERY,
    projectId,
    credentialId: null as string | null,
    credential: null,
    config: { projectId: 'my-valid-project-1', location: 'US' },
    title: 'Title',
    createdById: null,
    ownerIds: [],
  };
  const summary: StorageCredentialSummary = { access: 'restricted', state: 'ready' };
  const candidate = { credentialId: 'cred-1', definitionId: 'google-service-account' };
  const bound = { credentialId: 'bound-cred', definitionId: 'google-service-account' };
  const dataStorageRepository = {
    save: jest.fn().mockImplementation(async entity => entity),
    findOne: jest.fn().mockImplementation(async () => storage),
    manager: { connection: { options: { type: 'sqlite' } } },
  };
  const dataStorageService = { getByProjectIdAndId: jest.fn().mockResolvedValue(storage) };
  const dataStorageMapper = { toDomainDto: jest.fn().mockReturnValue({ id: storageId }) };
  const dataStorageAccessFacade = { verifyAccess: jest.fn().mockResolvedValue(undefined) };
  const credentialsResolver = {
    resolveCredential: jest.fn().mockResolvedValue({ type: 'service_account' }),
    summarize: jest.fn().mockResolvedValue(new Map([[storageId, summary]])),
  };
  const storageCredentials = {
    checkStorageBinding: jest.fn().mockResolvedValue(candidate),
    assertCanUseCredential: jest.fn().mockResolvedValue(undefined),
    resolveForStorage: jest.fn().mockResolvedValue(bound),
    lockBoundCredentialId: jest.fn().mockResolvedValue('bound-cred'),
    bindStorage: jest.fn().mockResolvedValue(undefined),
  };
  const userProjectionsFetcherService = {
    fetchUserProjectionsList: jest.fn().mockResolvedValue({
      getByUserId: jest.fn().mockReturnValue(null),
    }),
  };
  const eventDispatcher = { publishExternal: jest.fn().mockResolvedValue(undefined) };
  const accessDecisionService = { canAccess: jest.fn().mockResolvedValue(true) };
  const contextAccessService = { updateStorageContexts: jest.fn().mockResolvedValue(undefined) };
  const storageOwnerRepository = {
    delete: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
  };

  const service = new UpdateDataStorageService(
    dataStorageRepository as never,
    dataStorageService as never,
    dataStorageMapper as never,
    dataStorageAccessFacade as never,
    credentialsResolver as never,
    storageCredentials as never,
    new LegacyStorageCredentialReader({} as never, {} as never, {} as never, {} as never),
    userProjectionsFetcherService as never,
    {} as never,
    storageOwnerRepository as never,
    eventDispatcher as never,
    accessDecisionService as never,
    contextAccessService as never
  );

  return {
    service,
    storage,
    summary,
    candidate,
    bound,
    dataStorageRepository,
    dataStorageService,
    dataStorageMapper,
    dataStorageAccessFacade,
    credentialsResolver,
    storageCredentials,
    accessDecisionService,
    eventDispatcher,
    contextAccessService,
    storageOwnerRepository,
  };
}

function makeCommand(
  input: {
    config?: Record<string, unknown>;
    title?: string;
    reusableCredentialId?: string | null;
    sentOldCredentialFields?: boolean;
    isPluginAuth?: boolean;
    ownerIds?: string[];
    contextIds?: string[];
    availableForUse?: boolean;
    availableForMaintenance?: boolean;
  } = {}
): UpdateDataStorageCommand {
  return new UpdateDataStorageCommand({
    id: storageId,
    projectId,
    config: input.config as never,
    title: input.title,
    reusableCredentialId: input.reusableCredentialId,
    sentOldCredentialFields: input.sentOldCredentialFields,
    isPluginAuth: input.isPluginAuth,
    ownerIds: input.ownerIds,
    userId: 'user-1',
    roles: ['editor'],
    availableForUse: input.availableForUse,
    availableForMaintenance: input.availableForMaintenance,
    contextIds: input.contextIds,
  });
}

function makeFullCommand(input: Parameters<typeof makeCommand>[0] = {}): UpdateDataStorageCommand {
  return makeCommand({
    config: { projectId: 'my-valid-project-1', location: 'US' },
    title: 'Title',
    ...input,
  });
}

const callOrder = (mock: jest.Mock) => mock.mock.invocationCallOrder[0];

describe('UpdateDataStorageService - partial updates', () => {
  const actor = { projectId, userId: 'user-1', roles: ['editor'] };

  it.each(['bound', 'legacy'] as const)(
    'allows a rename with an unchanged invalid config and a %s Credential',
    async credentialKind => {
      const fixture = makeService();
      const config = { account: 'existing-account' };
      Object.assign(fixture.storage, { type: DataStorageType.SNOWFLAKE, config });
      if (credentialKind === 'legacy') {
        fixture.storage.credentialId = 'old-credential';
        fixture.storageCredentials.resolveForStorage.mockResolvedValue(null);
        fixture.storageCredentials.lockBoundCredentialId.mockResolvedValue(null);
      }

      await fixture.service.run(makeFullCommand({ title: 'Renamed', config }));

      expect(fixture.dataStorageRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Renamed', config })
      );
      expect(fixture.dataStorageAccessFacade.verifyAccess).not.toHaveBeenCalled();
    }
  );

  it.each([
    { config: { account: 'changed-account' } },
    { config: { account: 'existing-account' }, reusableCredentialId: 'new-credential' },
  ])('rejects an invalid config when the connection or Credential changes: %j', async input => {
    const fixture = makeService();
    Object.assign(fixture.storage, {
      type: DataStorageType.SNOWFLAKE,
      config: { account: 'existing-account' },
    });

    await expect(fixture.service.run(makeFullCommand(input))).rejects.toBeInstanceOf(
      AccessValidationException
    );

    expect(fixture.dataStorageRepository.save).not.toHaveBeenCalled();
    expect(fixture.storageCredentials.bindStorage).not.toHaveBeenCalled();
  });

  it('keeps the current config and Credential when only the title is supplied', async () => {
    const fixture = makeService();
    fixture.dataStorageRepository.findOne.mockResolvedValue({
      ...fixture.storage,
      config: { projectId: 'current-project', location: 'EU' },
    });

    await fixture.service.run(makeCommand({ title: 'Renamed' }));

    expect(fixture.dataStorageRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Renamed',
        config: { projectId: 'current-project', location: 'EU' },
      })
    );
    expect(fixture.dataStorageAccessFacade.verifyAccess).not.toHaveBeenCalled();
    expect(fixture.storageCredentials.bindStorage).not.toHaveBeenCalled();
    expect(fixture.storageCredentials.resolveForStorage).not.toHaveBeenCalled();
    expect(fixture.storageCredentials.lockBoundCredentialId).not.toHaveBeenCalled();
  });

  it('updates sharing for an unconfigured Storage without validating its connection', async () => {
    const fixture = makeService();
    fixture.dataStorageRepository.findOne.mockResolvedValue({
      ...fixture.storage,
      config: undefined,
      availableForUse: false,
    });
    fixture.accessDecisionService.canAccess.mockImplementation(
      async (...args) => args[4] === Action.CONFIGURE_SHARING
    );

    await fixture.service.run(makeCommand({ availableForUse: true }));

    expect(fixture.dataStorageRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ config: undefined, availableForUse: true, title: 'Title' })
    );
    expect(fixture.dataStorageAccessFacade.verifyAccess).not.toHaveBeenCalled();
    expect(fixture.accessDecisionService.canAccess).toHaveBeenCalledWith(
      actor.userId,
      actor.roles,
      'STORAGE',
      storageId,
      Action.CONFIGURE_SHARING,
      projectId
    );
  });

  it('updates Contexts with CONFIGURE_SHARING permission alone', async () => {
    const { service, accessDecisionService, contextAccessService, dataStorageAccessFacade } =
      makeService();
    accessDecisionService.canAccess.mockImplementation(
      async (...args) => args[4] === Action.CONFIGURE_SHARING
    );

    await service.run(makeCommand({ contextIds: ['context'] }));

    expect(contextAccessService.updateStorageContexts).toHaveBeenCalledWith(
      storageId,
      projectId,
      ['context'],
      actor.userId,
      actor.roles
    );
    expect(dataStorageAccessFacade.verifyAccess).not.toHaveBeenCalled();
  });

  it('updates owners with MANAGE_OWNERS permission alone', async () => {
    const { service, accessDecisionService, storageOwnerRepository, dataStorageAccessFacade } =
      makeService();
    accessDecisionService.canAccess.mockImplementation(
      async (...args) => args[4] === Action.MANAGE_OWNERS
    );

    await service.run(makeCommand({ ownerIds: [] }));

    expect(storageOwnerRepository.delete).toHaveBeenCalledWith({ storageId });
    expect(dataStorageAccessFacade.verifyAccess).not.toHaveBeenCalled();
  });

  it('requires MANAGE_OWNERS for owner changes', async () => {
    const { service, accessDecisionService, dataStorageRepository, storageOwnerRepository } =
      makeService();
    accessDecisionService.canAccess.mockImplementation(
      async (...args) => args[4] !== Action.MANAGE_OWNERS
    );

    await expect(service.run(makeCommand({ ownerIds: [] }))).rejects.toBeInstanceOf(
      ForbiddenException
    );

    expect(dataStorageRepository.save).not.toHaveBeenCalled();
    expect(storageOwnerRepository.delete).not.toHaveBeenCalled();
  });

  it('rejects an update without fields', async () => {
    const { service, dataStorageRepository } = makeService();

    await expect(service.run(makeCommand())).rejects.toThrow('Supply at least one Storage field.');

    expect(dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('rejects selecting a Credential before the Storage has a configuration', async () => {
    const { service, storage, storageCredentials, dataStorageRepository } = makeService();
    storage.config = undefined as never;

    await expect(
      service.run(makeCommand({ reusableCredentialId: 'cred-1' }))
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(storageCredentials.checkStorageBinding).not.toHaveBeenCalled();
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('rechecks field permissions after validation and before saving', async () => {
    const { service, accessDecisionService, dataStorageAccessFacade, dataStorageRepository } =
      makeService();
    accessDecisionService.canAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(
      service.run(makeCommand({ reusableCredentialId: 'cred-1' }))
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(dataStorageAccessFacade.verifyAccess).toHaveBeenCalled();
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('requires sharing permission for Context changes before saving', async () => {
    const fixture = makeService();
    fixture.accessDecisionService.canAccess.mockImplementation(
      async (...args) => args[4] !== Action.CONFIGURE_SHARING
    );

    await expect(
      fixture.service.run(makeCommand({ contextIds: ['context'] }))
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fixture.dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('validates the saved configuration before taking the Storage lock', async () => {
    const fixture = makeService();

    await fixture.service.run(makeCommand({ reusableCredentialId: 'cred-1' }));

    expect(fixture.dataStorageAccessFacade.verifyAccess).toHaveBeenCalledWith(
      DataStorageType.GOOGLE_BIGQUERY,
      fixture.storage.config,
      { type: 'service_account' }
    );
    expect(callOrder(fixture.dataStorageAccessFacade.verifyAccess)).toBeLessThan(
      callOrder(fixture.dataStorageRepository.findOne)
    );
  });

  it('rejects a config change committed while a selected Credential was validated', async () => {
    const fixture = makeService();
    fixture.dataStorageRepository.findOne.mockResolvedValue({
      ...fixture.storage,
      config: { projectId: 'current-project', location: 'EU' },
    });

    await expect(
      fixture.service.run(
        makeCommand({
          reusableCredentialId: 'cred-1',
        })
      )
    ).rejects.toBeInstanceOf(ConflictException);

    expect(fixture.dataStorageRepository.save).not.toHaveBeenCalled();
    expect(fixture.storageCredentials.bindStorage).not.toHaveBeenCalled();
  });

  it('rejects a rebind committed while a config-only update was validated', async () => {
    const fixture = makeService();
    fixture.storageCredentials.lockBoundCredentialId.mockResolvedValue('new-bound-credential');

    await expect(
      fixture.service.run(
        makeCommand({
          config: { ...fixture.storage.config, location: 'EU' },
        })
      )
    ).rejects.toBeInstanceOf(ConflictException);

    expect(fixture.dataStorageRepository.save).not.toHaveBeenCalled();
    expect(fixture.storageCredentials.bindStorage).not.toHaveBeenCalled();
  });

  it('preserves omitted title and sharing edits committed during validation', async () => {
    const fixture = makeService();
    fixture.dataStorageRepository.findOne.mockResolvedValue({
      ...fixture.storage,
      title: 'Concurrent title',
      availableForUse: false,
    });

    await fixture.service.run(
      makeCommand({
        config: { ...fixture.storage.config, location: 'EU' },
      })
    );

    expect(fixture.dataStorageRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Concurrent title',
        availableForUse: false,
        config: { ...fixture.storage.config, location: 'EU' },
      })
    );
  });

  it('rechecks USE after validation when the config redirects the bound Credential', async () => {
    const fixture = makeService();
    fixture.storageCredentials.assertCanUseCredential
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ForbiddenException('Credential access was revoked'));

    await expect(
      fixture.service.run(
        makeCommand({
          config: { projectId: 'other-project', location: 'EU' },
        })
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fixture.storageCredentials.assertCanUseCredential).toHaveBeenCalledTimes(2);
  });
});

describe('UpdateDataStorageService - Legacy BigQuery', () => {
  it('preserves the project ID and title while changing another configuration field', async () => {
    const { service, storage, storageCredentials, dataStorageAccessFacade, dataStorageRepository } =
      makeService();
    storage.type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;
    const command = makeCommand({
      title: 'Replacement title',
      config: { projectId: 'replacement-project', location: 'EU' },
    });

    await service.run(command);

    expect(dataStorageAccessFacade.verifyAccess).toHaveBeenCalledWith(
      DataStorageType.LEGACY_GOOGLE_BIGQUERY,
      { projectId: 'my-valid-project-1', location: 'EU' },
      { type: 'service_account' }
    );
    expect(dataStorageRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Title',
        config: { projectId: 'my-valid-project-1', location: 'EU' },
      })
    );
    expect(storageCredentials.assertCanUseCredential).not.toHaveBeenCalled();
    expect(command.config).toEqual({ projectId: 'replacement-project', location: 'EU' });
  });

  it('preserves the title in a title-only update', async () => {
    const { service, storage, dataStorageRepository } = makeService();
    storage.type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

    await service.run(makeCommand({ title: 'Replacement title' }));

    expect(dataStorageRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Title' })
    );
  });
});

describe('UpdateDataStorageService - reusableCredentialId', () => {
  it('keeps the binding and skips the access check when the config is unchanged', async () => {
    const { service, storageCredentials, dataStorageAccessFacade, dataStorageRepository } =
      makeService();

    await service.run(makeFullCommand());

    expect(storageCredentials.checkStorageBinding).not.toHaveBeenCalled();
    expect(storageCredentials.bindStorage).not.toHaveBeenCalled();
    expect(dataStorageAccessFacade.verifyAccess).not.toHaveBeenCalled();
    expect(dataStorageRepository.save).toHaveBeenCalled();
  });

  it('checks the selected Credential after EDIT, verifies access with it, and binds it last', async () => {
    const {
      service,
      storage,
      candidate,
      accessDecisionService,
      storageCredentials,
      credentialsResolver,
      dataStorageAccessFacade,
      dataStorageRepository,
    } = makeService();

    await service.run(makeFullCommand({ reusableCredentialId: 'cred-1' }));

    const bindInput = {
      projectId,
      userId: 'user-1',
      roles: ['editor'],
      credentialId: 'cred-1',
      type: DataStorageType.GOOGLE_BIGQUERY,
    };
    expect(storageCredentials.checkStorageBinding).toHaveBeenCalledWith(bindInput);
    expect(credentialsResolver.resolveCredential).toHaveBeenCalledWith(storage, candidate);
    expect(dataStorageAccessFacade.verifyAccess).toHaveBeenCalledWith(
      DataStorageType.GOOGLE_BIGQUERY,
      { projectId: 'my-valid-project-1', location: 'US' },
      { type: 'service_account' }
    );
    expect(storageCredentials.bindStorage).toHaveBeenCalledWith({ ...bindInput, storageId });
    const editCall = accessDecisionService.canAccess.mock.calls.findIndex(
      call => call[4] === Action.EDIT
    );
    expect(accessDecisionService.canAccess.mock.invocationCallOrder[editCall]).toBeLessThan(
      callOrder(storageCredentials.checkStorageBinding)
    );
    expect(callOrder(dataStorageAccessFacade.verifyAccess)).toBeLessThan(
      callOrder(dataStorageRepository.save)
    );
    // The bind takes the Credential lock, so it runs after every other write of the save.
    expect(callOrder(dataStorageRepository.save)).toBeLessThan(
      callOrder(storageCredentials.bindStorage)
    );
  });

  it('runs no check when the config comes back in another form', async () => {
    const { service, dataStorageAccessFacade, credentialsResolver } = makeService();

    await service.run(
      makeFullCommand({ config: { location: 'US', projectId: 'my-valid-project-1', extra: 'x' } })
    );

    expect(credentialsResolver.resolveCredential).not.toHaveBeenCalled();
    expect(dataStorageAccessFacade.verifyAccess).not.toHaveBeenCalled();
  });

  it('neither binds nor saves when verifyAccess rejects the selected Credential', async () => {
    const { service, storageCredentials, dataStorageAccessFacade, dataStorageRepository } =
      makeService();
    dataStorageAccessFacade.verifyAccess.mockRejectedValue(new BadRequestException('denied'));

    await expect(service.run(makeFullCommand({ reusableCredentialId: 'cred-1' }))).rejects.toThrow(
      'denied'
    );
    expect(storageCredentials.bindStorage).not.toHaveBeenCalled();
    expect(dataStorageRepository.findOne).not.toHaveBeenCalled();
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('refuses to bind without EDIT on the Storage', async () => {
    const { service, accessDecisionService, storageCredentials } = makeService();
    accessDecisionService.canAccess.mockImplementation(async (...args: unknown[]) => {
      return args[4] !== Action.EDIT;
    });

    await expect(service.run(makeFullCommand({ reusableCredentialId: 'cred-1' }))).rejects.toThrow(
      ForbiddenException
    );
    expect(storageCredentials.checkStorageBinding).not.toHaveBeenCalled();
    expect(storageCredentials.bindStorage).not.toHaveBeenCalled();
  });

  it('rejects null', async () => {
    const { service, storageCredentials } = makeService();

    await expect(service.run(makeFullCommand({ reusableCredentialId: null }))).rejects.toThrow(
      new BadRequestException('reusableCredentialId cannot be null.')
    );
    expect(storageCredentials.bindStorage).not.toHaveBeenCalled();
  });

  it('rejects reusableCredentialId together with credentials, credentialId or sourceStorageId', async () => {
    const { service, storageCredentials } = makeService();

    await expect(
      service.run(
        makeFullCommand({ reusableCredentialId: 'cred-1', sentOldCredentialFields: true })
      )
    ).rejects.toThrow(
      new BadRequestException(
        'Send reusableCredentialId without credentials, credentialId or sourceStorageId.'
      )
    );
    expect(storageCredentials.bindStorage).not.toHaveBeenCalled();
  });

  it('tells a tab loaded before the upgrade to reload when it sends the old fields alone', async () => {
    const { service, dataStorageRepository } = makeService();

    await expect(service.run(makeFullCommand({ sentOldCredentialFields: true }))).rejects.toThrow(
      new BadRequestException('This page is out of date. Reload it.')
    );
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('refuses a plugin-authenticated request that sends reusableCredentialId before any other check', async () => {
    const { service, dataStorageService, storageCredentials } = makeService();

    await expect(
      service.run(
        makeFullCommand({
          reusableCredentialId: null,
          sentOldCredentialFields: true,
          isPluginAuth: true,
        })
      )
    ).rejects.toThrow(new ForbiddenException("Plugins cannot change a Storage's Credential."));
    expect(dataStorageService.getByProjectIdAndId).not.toHaveBeenCalled();
    expect(storageCredentials.bindStorage).not.toHaveBeenCalled();
  });

  it('refuses a plugin request that sends only a Credential id', async () => {
    const { service, storageCredentials, dataStorageRepository } = makeService();

    await expect(
      service.run(makeFullCommand({ reusableCredentialId: 'cred-1', isPluginAuth: true }))
    ).rejects.toThrow(new ForbiddenException("Plugins cannot change a Storage's Credential."));
    expect(storageCredentials.checkStorageBinding).not.toHaveBeenCalled();
    expect(storageCredentials.bindStorage).not.toHaveBeenCalled();
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('lets a plugin-authenticated request change other settings', async () => {
    const { service, dataStorageRepository } = makeService();

    await service.run(makeFullCommand({ isPluginAuth: true }));

    expect(dataStorageRepository.save).toHaveBeenCalled();
  });

  it('refuses a plugin request that moves the Databricks host, before any binding lookup', async () => {
    const { service, storage, storageCredentials, dataStorageRepository } = makeService();
    storage.type = DataStorageType.DATABRICKS;
    storage.config = { host: 'workspace.cloud.databricks.com', httpPath: '/sql/1' } as never;

    await expect(
      service.run(
        makeFullCommand({
          config: { host: 'collector.vendor.example', httpPath: '/sql/1' },
          isPluginAuth: true,
        })
      )
    ).rejects.toThrow(
      new ForbiddenException("Plugins cannot change where a Storage's key is sent.")
    );
    expect(storageCredentials.resolveForStorage).not.toHaveBeenCalled();
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('saves a plugin request that changes a Databricks setting other than the host', async () => {
    const { service, storage, dataStorageAccessFacade, dataStorageRepository } = makeService();
    storage.type = DataStorageType.DATABRICKS;
    storage.config = { host: 'workspace.cloud.databricks.com', httpPath: '/sql/1' } as never;

    await service.run(
      makeFullCommand({
        config: { host: 'workspace.cloud.databricks.com', httpPath: '/sql/2' },
        isPluginAuth: true,
      })
    );

    expect(dataStorageAccessFacade.verifyAccess).toHaveBeenCalled();
    expect(dataStorageRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { host: 'workspace.cloud.databricks.com', httpPath: '/sql/2' },
      })
    );
  });

  it('verifies access with no credentials when the Storage has none', async () => {
    const { service, credentialsResolver, storageCredentials, dataStorageAccessFacade } =
      makeService();
    storageCredentials.resolveForStorage.mockResolvedValue(null);
    storageCredentials.lockBoundCredentialId.mockResolvedValue(null);

    await service.run(makeFullCommand());

    expect(credentialsResolver.resolveCredential).not.toHaveBeenCalled();
    expect(dataStorageAccessFacade.verifyAccess).toHaveBeenCalledWith(
      DataStorageType.GOOGLE_BIGQUERY,
      { projectId: 'my-valid-project-1', location: 'US' },
      {}
    );
  });

  it('saves an unconverted Storage on its old key without an access check', async () => {
    const { service, storage, storageCredentials, dataStorageAccessFacade } = makeService();
    storage.credentialId = 'old-row';
    storageCredentials.resolveForStorage.mockResolvedValue(null);
    storageCredentials.lockBoundCredentialId.mockResolvedValue(null);

    await service.run(makeFullCommand({ config: { projectId: 'other-project-1' } }));

    expect(dataStorageAccessFacade.verifyAccess).not.toHaveBeenCalled();
  });

  it('rejects a malformed config on an unconverted Storage without an access check', async () => {
    const { service, storage, storageCredentials, dataStorageAccessFacade, dataStorageRepository } =
      makeService();
    storage.type = DataStorageType.DATABRICKS;
    storage.config = { host: 'workspace.cloud.databricks.com', httpPath: '/sql/1' } as never;
    storage.credentialId = 'old-row';
    storageCredentials.resolveForStorage.mockResolvedValue(null);
    storageCredentials.lockBoundCredentialId.mockResolvedValue(null);
    const malformed = { host: 'workspace.cloud.databricks.com', httpPath: '' };
    const expected = ValidationResult.invalidInput(
      'config',
      DatabricksConfigSchema.safeParse(malformed).error!
    );

    const error = await service
      .run(makeFullCommand({ config: malformed }))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AccessValidationException);
    expect(error).toMatchObject({ message: expected.errorMessage, errorDetails: expected.reason });
    expect(dataStorageAccessFacade.verifyAccess).not.toHaveBeenCalled();
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('answers with the Credential summary the member sees', async () => {
    const { service, storage, summary, credentialsResolver, dataStorageMapper } = makeService();

    await service.run(makeFullCommand({ reusableCredentialId: 'cred-1' }));

    expect(credentialsResolver.summarize).toHaveBeenCalledWith(
      projectId,
      'user-1',
      ['editor'],
      [storage]
    );
    expect(dataStorageMapper.toDomainDto).toHaveBeenCalledWith(
      storage,
      0,
      0,
      null,
      [],
      undefined,
      summary
    );
  });
});

describe('UpdateDataStorageService - config change on a bound Storage', () => {
  it('verifies the new config with the bound Credential', async () => {
    const {
      service,
      storage,
      bound,
      storageCredentials,
      credentialsResolver,
      dataStorageAccessFacade,
    } = makeService();

    await service.run(
      makeFullCommand({ config: { projectId: 'my-valid-project-1', location: 'EU' } })
    );

    expect(storageCredentials.resolveForStorage).toHaveBeenCalledWith(storage);
    expect(credentialsResolver.resolveCredential).toHaveBeenCalledWith(storage, bound);
    expect(dataStorageAccessFacade.verifyAccess).toHaveBeenCalledWith(
      DataStorageType.GOOGLE_BIGQUERY,
      { projectId: 'my-valid-project-1', location: 'EU' },
      { type: 'service_account' }
    );
    expect(storageCredentials.bindStorage).not.toHaveBeenCalled();
  });

  it('lets a member without USE change a setting that keeps the connection target', async () => {
    const { service, storageCredentials, dataStorageRepository } = makeService();
    storageCredentials.assertCanUseCredential.mockRejectedValue(
      new ForbiddenException('You cannot use this Credential.')
    );

    await service.run(
      makeFullCommand({ config: { projectId: 'my-valid-project-1', location: 'EU' } })
    );

    expect(storageCredentials.assertCanUseCredential).not.toHaveBeenCalled();
    expect(dataStorageRepository.save).toHaveBeenCalled();
  });

  it('asks for USE on the bound Credential when the change moves the connection target', async () => {
    const { service, storageCredentials, dataStorageAccessFacade, dataStorageRepository } =
      makeService();
    storageCredentials.assertCanUseCredential.mockRejectedValue(
      new ForbiddenException('You cannot use this Credential.')
    );

    await expect(
      service.run(makeFullCommand({ config: { projectId: 'other-project-1', location: 'US' } }))
    ).rejects.toThrow(new ForbiddenException('You cannot use this Credential.'));
    expect(storageCredentials.assertCanUseCredential).toHaveBeenCalledWith({
      projectId,
      userId: 'user-1',
      roles: ['editor'],
      credentialId: 'bound-cred',
    });
    expect(dataStorageAccessFacade.verifyAccess).not.toHaveBeenCalled();
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('saves the change without the check when the bound Credential is unavailable', async () => {
    const { service, credentialsResolver, dataStorageAccessFacade, dataStorageRepository } =
      makeService();
    credentialsResolver.resolveCredential.mockRejectedValue(
      new StorageCredentialUnavailableException(
        "This Storage's Credential is disabled. A Credential maintainer can enable it on the Credentials page.",
        false
      )
    );

    await service.run(
      makeFullCommand({ config: { projectId: 'my-valid-project-1', location: 'EU' } })
    );

    expect(dataStorageAccessFacade.verifyAccess).not.toHaveBeenCalled();
    expect(dataStorageRepository.save).toHaveBeenCalled();
  });

  it('still rejects a malformed config while the bound Credential is unavailable', async () => {
    const {
      service,
      storage,
      credentialsResolver,
      dataStorageAccessFacade,
      dataStorageRepository,
    } = makeService();
    storage.type = DataStorageType.DATABRICKS;
    storage.config = { host: 'workspace.cloud.databricks.com', httpPath: '/sql/1' } as never;
    credentialsResolver.resolveCredential.mockRejectedValue(
      new StorageCredentialUnavailableException("This Storage's Credential is disabled.", false)
    );
    const malformed = { host: 'workspace.cloud.databricks.com', httpPath: '' };
    const expected = ValidationResult.invalidInput(
      'config',
      DatabricksConfigSchema.safeParse(malformed).error!
    );

    const error = await service
      .run(makeFullCommand({ config: malformed }))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AccessValidationException);
    expect(error).toMatchObject({ message: expected.errorMessage, errorDetails: expected.reason });
    expect(dataStorageAccessFacade.verifyAccess).not.toHaveBeenCalled();
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('refuses a Databricks host outside Databricks workspaces while the Credential is disabled', async () => {
    const { service, storage, credentialsResolver, dataStorageRepository } = makeService();
    storage.type = DataStorageType.DATABRICKS;
    storage.config = { host: 'workspace.cloud.databricks.com', httpPath: '/sql/1' } as never;
    credentialsResolver.resolveCredential.mockRejectedValue(
      new StorageCredentialUnavailableException("This Storage's Credential is disabled.", false)
    );

    const error = await service
      .run(makeFullCommand({ config: { host: 'collector.vendor.example', httpPath: '/sql/1' } }))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AccessValidationException);
    expect(error).toMatchObject({
      errorDetails: { fieldErrors: [expect.objectContaining({ field: 'config.host' })] },
    });
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('still fails on any other error while resolving the bound Credential', async () => {
    const { service, credentialsResolver, dataStorageRepository } = makeService();
    credentialsResolver.resolveCredential.mockRejectedValue(new Error('db down'));

    await expect(
      service.run(makeFullCommand({ config: { projectId: 'my-valid-project-1', location: 'EU' } }))
    ).rejects.toThrow('db down');
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('answers 404 and saves nothing when the Storage is deleted during the checks', async () => {
    const { service, dataStorageRepository } = makeService();
    dataStorageRepository.findOne.mockResolvedValue(null);

    await expect(service.run(makeFullCommand())).rejects.toBeInstanceOf(NotFoundException);
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a concurrent config change after taking the Storage lock', async () => {
    const { service, storage, storageCredentials, dataStorageRepository } = makeService();
    dataStorageRepository.manager.connection.options.type = 'mysql';
    // Rebound to another Credential and target by another member after the first read.
    const fresh = { ...storage, config: { projectId: 'other-project-1', location: 'US' } };
    dataStorageRepository.findOne.mockResolvedValue(fresh);
    storageCredentials.lockBoundCredentialId.mockResolvedValue('cred-2');

    await expect(service.run(makeFullCommand())).rejects.toBeInstanceOf(ConflictException);

    expect(dataStorageRepository.findOne).toHaveBeenCalledWith({
      where: { id: storageId, projectId },
      loadEagerRelations: false,
      lock: { mode: 'pessimistic_write' },
    });
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
    expect(storageCredentials.assertCanUseCredential).not.toHaveBeenCalled();
  });

  it('rejects a concurrent rebind before saving a changed target', async () => {
    const { service, storageCredentials, dataStorageRepository } = makeService();
    storageCredentials.lockBoundCredentialId.mockResolvedValue('rebound-cred');

    await expect(
      service.run(makeFullCommand({ config: { projectId: 'other-project-1', location: 'US' } }))
    ).rejects.toBeInstanceOf(ConflictException);
    expect(storageCredentials.lockBoundCredentialId).toHaveBeenCalledWith(projectId, storageId);
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('rechecks USE when the same bound Credential will receive a changed target', async () => {
    const { service, storageCredentials } = makeService();

    await service.run(
      makeFullCommand({ config: { projectId: 'other-project-1', location: 'US' } })
    );

    expect(storageCredentials.lockBoundCredentialId).toHaveBeenCalledTimes(1);
    expect(storageCredentials.assertCanUseCredential).toHaveBeenCalledTimes(2);
  });

  it('checks for a concurrent rebind even when the connection target stays', async () => {
    const { service, storageCredentials } = makeService();

    await service.run(
      makeFullCommand({ config: { projectId: 'my-valid-project-1', location: 'EU' } })
    );

    expect(storageCredentials.lockBoundCredentialId).toHaveBeenCalledWith(projectId, storageId);
    expect(storageCredentials.assertCanUseCredential).not.toHaveBeenCalled();
  });

  it('asks for USE before resolving an unavailable bound Credential when the target moves', async () => {
    const { service, storageCredentials, credentialsResolver, dataStorageRepository } =
      makeService();
    credentialsResolver.resolveCredential.mockRejectedValue(
      new StorageCredentialUnavailableException("This Storage's Credential is disabled.", false)
    );
    storageCredentials.assertCanUseCredential.mockRejectedValue(
      new ForbiddenException('You cannot use this Credential.')
    );

    await expect(
      service.run(makeFullCommand({ config: { projectId: 'other-project-1', location: 'US' } }))
    ).rejects.toThrow(new ForbiddenException('You cannot use this Credential.'));
    expect(credentialsResolver.resolveCredential).not.toHaveBeenCalled();
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a legacy key changed while the unconverted Storage was validated', async () => {
    const { service, storage, storageCredentials, dataStorageRepository } = makeService();
    storage.credentialId = 'old-row';
    storageCredentials.resolveForStorage.mockResolvedValue(null);
    storageCredentials.lockBoundCredentialId.mockResolvedValue(null);
    dataStorageRepository.findOne.mockResolvedValue({
      ...storage,
      credentialId: 'replacement-row',
    });

    await expect(
      service.run(makeFullCommand({ config: { projectId: 'my-valid-project-1', location: 'EU' } }))
    ).rejects.toBeInstanceOf(ConflictException);

    expect(dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a binding added while an unbound Storage was validated', async () => {
    const { service, storage, storageCredentials, dataStorageRepository } = makeService();
    storage.credentialId = 'old-row';
    storageCredentials.resolveForStorage.mockResolvedValue(null);
    storageCredentials.lockBoundCredentialId.mockResolvedValue(null);
    storageCredentials.lockBoundCredentialId.mockResolvedValue('new-cred');

    await expect(
      service.run(makeFullCommand({ config: { projectId: 'other-project-1', location: 'US' } }))
    ).rejects.toBeInstanceOf(ConflictException);
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
    expect(storageCredentials.assertCanUseCredential).not.toHaveBeenCalled();
  });

  it('checks that an unbound Storage remains unbound when the connection target stays', async () => {
    const { service, storage, storageCredentials } = makeService();
    storage.credentialId = 'old-row';
    storageCredentials.resolveForStorage.mockResolvedValue(null);
    storageCredentials.lockBoundCredentialId.mockResolvedValue(null);

    await service.run(
      makeFullCommand({ config: { projectId: 'my-valid-project-1', location: 'EU' } })
    );

    expect(storageCredentials.lockBoundCredentialId).toHaveBeenCalledWith(projectId, storageId);
    expect(storageCredentials.assertCanUseCredential).not.toHaveBeenCalled();
  });
});

describe('UpdateDataStorageService - Redshift connection type', () => {
  const provisioned = {
    connectionType: 'PROVISIONED',
    region: 'us-east-1',
    database: 'dev',
    clusterIdentifier: 'c1',
  };

  it('asks for USE on a switch to Serverless even when both identifiers were already stored', async () => {
    const { service, storage, storageCredentials, dataStorageRepository } = makeService();
    storage.type = DataStorageType.AWS_REDSHIFT;
    storage.config = { ...provisioned, workgroupName: 'w2' } as never;
    storageCredentials.assertCanUseCredential.mockRejectedValue(
      new ForbiddenException('You cannot use this Credential.')
    );

    await expect(
      service.run(
        makeFullCommand({
          config: { ...provisioned, connectionType: 'SERVERLESS', workgroupName: 'w2' },
        })
      )
    ).rejects.toThrow(new ForbiddenException('You cannot use this Credential.'));
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
  });

  it('saves a re-sent config without the identifier its schema drops', async () => {
    const { service, storage, storageCredentials, dataStorageRepository } = makeService();
    storage.type = DataStorageType.AWS_REDSHIFT;
    storage.config = { ...provisioned } as never;

    await service.run(makeFullCommand({ config: { ...provisioned, workgroupName: 'w2' } }));

    expect(storageCredentials.assertCanUseCredential).not.toHaveBeenCalled();
    expect(dataStorageRepository.save.mock.calls[0][0].config).toStrictEqual(provisioned);
  });
});

describe('UpdateDataStorageService - storage.config.set event', () => {
  it('sends the event for a first config only after the save, bind included, has finished', async () => {
    const { service, storage, storageCredentials, eventDispatcher } = makeService();
    storage.config = null as never;

    await service.run(makeFullCommand({ reusableCredentialId: 'cred-1' }));

    expect(eventDispatcher.publishExternal).toHaveBeenCalledTimes(1);
    expect(callOrder(storageCredentials.bindStorage)).toBeLessThan(
      callOrder(eventDispatcher.publishExternal)
    );
  });

  it('sends no event when the bind at the end of the save fails', async () => {
    const { service, storage, storageCredentials, eventDispatcher } = makeService();
    storage.config = null as never;
    storageCredentials.bindStorage.mockRejectedValue(
      new ForbiddenException('You cannot use this Credential.')
    );

    await expect(service.run(makeFullCommand({ reusableCredentialId: 'cred-1' }))).rejects.toThrow(
      ForbiddenException
    );
    expect(eventDispatcher.publishExternal).not.toHaveBeenCalled();
  });
});

describe('UpdateDataStorageService - BigQuery projectId validation', () => {
  it('rejects an update with an invalid projectId before save', async () => {
    const { service, dataStorageRepository, dataStorageAccessFacade } = makeService();

    const error = (await service
      .run(makeFullCommand({ config: { projectId: 'GTM-NC2077' } }))
      .catch((e: unknown) => e)) as BadRequestException;
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toMatch(/^Invalid config — projectId: /);
    // The storage form highlights the Project ID input from `fieldErrors`.
    expect(error.getResponse()).toEqual({
      message: error.message,
      error: 'Bad Request',
      errorDetails: {
        errors: expect.any(Array),
        fieldErrors: [
          { field: 'config.projectId', message: expect.stringContaining('Invalid GCP project ID') },
        ],
      },
    });
    expect(dataStorageRepository.save).not.toHaveBeenCalled();
    expect(dataStorageAccessFacade.verifyAccess).not.toHaveBeenCalled();
  });

  it('passes validation for an update with a valid projectId', async () => {
    const { service, dataStorageRepository } = makeService();

    await expect(service.run(makeFullCommand())).resolves.toBeDefined();
    expect(dataStorageRepository.save).toHaveBeenCalled();
  });
});
