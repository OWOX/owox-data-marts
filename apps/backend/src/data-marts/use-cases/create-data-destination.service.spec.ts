jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));

jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

jest.mock(
  '../data-destination-types/facades/data-destination-credentials-validator.facade',
  () => ({
    DataDestinationCredentialsValidatorFacade: jest.fn(),
  })
);

jest.mock(
  '../data-destination-types/facades/data-destination-credentials-processor.facade',
  () => ({
    DataDestinationCredentialsProcessorFacade: jest.fn(),
  })
);

jest.mock('../services/credential-type-resolver', () => ({
  resolveDestinationCredentialType: jest.fn().mockReturnValue('service-account'),
  extractDestinationIdentity: jest.fn().mockReturnValue('test@test.com'),
}));

jest.mock('../utils/sync-owners', () => ({
  syncOwners: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/resolve-owner-users', () => ({
  resolveOwnerUsers: jest.fn().mockReturnValue([]),
}));

import { CreateDataDestinationService } from './create-data-destination.service';
import { CreateDataDestinationCommand } from '../dto/domain/create-data-destination.command';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { syncOwners } from '../utils/sync-owners';

describe('CreateDataDestinationService', () => {
  const savedEntity = {
    id: 'dest-1',
    type: DataDestinationType.LOOKER_STUDIO,
    owners: [],
    ownerIds: [],
  };

  const createService = () => {
    const repository = {
      create: jest.fn().mockReturnValue(savedEntity),
      save: jest.fn().mockResolvedValue(savedEntity),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const mapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: 'dest-1' }),
    };
    const credentialsValidator = {
      checkCredentials: jest.fn().mockResolvedValue(undefined),
    };
    const credentialsProcessor = {
      processCredentials: jest.fn().mockResolvedValue({ type: 'looker-studio-credentials' }),
    };
    const dataDestinationCredentialService = {
      create: jest.fn().mockResolvedValue({ id: 'cred-1' }),
    };
    const candidate = { credentialId: 'credential-1', definitionId: 'google-service-account' };
    const destinationCredentials = {
      checkDestinationBinding: jest.fn().mockResolvedValue(candidate),
      bindDestination: jest.fn().mockResolvedValue(undefined),
    };
    const summaries = new Map([['dest-1', { access: 'visible', id: 'credential-1' }]]);
    const credentialsResolver = { summarize: jest.fn().mockResolvedValue(summaries) };
    const userProjectionsFetcherService = {
      fetchUserProjectionsList: jest.fn().mockResolvedValue({
        getByUserId: jest.fn().mockReturnValue(null),
      }),
    };
    const destinationOwnerRepository = {};
    const idpProjectionsFacade = {};

    const eventDispatcher = { publishLocalOnCommit: jest.fn() };

    const folderValidator = { validateConfiguredFolder: jest.fn().mockResolvedValue(undefined) };
    const advancedSearchIndexSync = { scheduleReindex: jest.fn().mockResolvedValue(undefined) };

    const service = new CreateDataDestinationService(
      repository as never,
      mapper as never,
      credentialsValidator as never,
      credentialsProcessor as never,
      dataDestinationCredentialService as never,
      destinationCredentials as never,
      credentialsResolver as never,
      userProjectionsFetcherService as never,
      destinationOwnerRepository as never,
      idpProjectionsFacade as never,
      eventDispatcher as never,
      folderValidator as never,
      advancedSearchIndexSync as never
    );

    return {
      service,
      candidate,
      dataDestinationCredentialService,
      destinationCredentials,
      credentialsResolver,
      summaries,
      mapper,
      repository,
      folderValidator,
      advancedSearchIndexSync,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call syncOwners with creator userId when ownerIds not provided', async () => {
    const { service } = createService();
    const command = new CreateDataDestinationCommand({
      projectId: 'proj-1',
      title: 'Test Dest',
      type: DataDestinationType.LOOKER_STUDIO,
      userId: 'user-0',
      credentials: { type: 'looker-studio-credentials' } as never,
    });

    await service.run(command);

    expect(syncOwners).toHaveBeenCalledWith(
      expect.anything(),
      'destinationId',
      'dest-1',
      'proj-1',
      ['user-0'],
      expect.anything(),
      expect.any(Function)
    );
  });

  it('should make a new destination available for use but private for maintenance by default', async () => {
    const { service } = createService();
    const command = new CreateDataDestinationCommand({
      projectId: 'proj-1',
      title: 'Test Dest',
      type: DataDestinationType.LOOKER_STUDIO,
      userId: 'user-0',
      credentials: { type: 'looker-studio-credentials' } as never,
    });

    await service.run(command);

    const repository = (service as unknown as { repository: { create: jest.Mock } }).repository;
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        availableForUse: true,
        availableForMaintenance: false,
      })
    );
  });

  it('respects an explicit availableForUse override (e.g. MCP-created destinations start unshared)', async () => {
    const { service } = createService();
    const command = new CreateDataDestinationCommand({
      projectId: 'proj-1',
      title: 'Test Dest',
      type: DataDestinationType.LOOKER_STUDIO,
      userId: 'user-0',
      credentials: { type: 'looker-studio-credentials' } as never,
      availableForUse: false,
    });

    await service.run(command);

    const repository = (service as unknown as { repository: { create: jest.Mock } }).repository;
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        availableForUse: false,
        availableForMaintenance: false,
      })
    );
  });

  it('always validates the configured folder on create (a new folder is always "changed")', async () => {
    const { service, folderValidator } = createService();
    const command = new CreateDataDestinationCommand({
      projectId: 'proj-1',
      title: 'Test Dest',
      type: DataDestinationType.LOOKER_STUDIO,
      userId: 'user-0',
      credentials: { type: 'looker-studio-credentials' } as never,
    });

    await service.run(command);

    expect(folderValidator.validateConfiguredFolder).toHaveBeenCalledTimes(1);
    expect(folderValidator.validateConfiguredFolder).toHaveBeenCalledWith(savedEntity, undefined);
  });

  it('should call syncOwners with provided ownerIds', async () => {
    const { service } = createService();
    const command = new CreateDataDestinationCommand({
      projectId: 'proj-1',
      title: 'Test Dest',
      type: DataDestinationType.LOOKER_STUDIO,
      userId: 'user-0',
      credentials: { type: 'looker-studio-credentials' } as never,
      ownerIds: ['user-1', 'user-2'],
    });

    await service.run(command);

    expect(syncOwners).toHaveBeenCalledWith(
      expect.anything(),
      'destinationId',
      'dest-1',
      'proj-1',
      ['user-1', 'user-2'],
      expect.anything(),
      expect.any(Function)
    );
  });

  describe('credentialless destination types', () => {
    // requiresCredentials(EXCEL) is false, and the guard has to run before every
    // credential-bearing branch: inline credentials would otherwise reach a validator that does
    // not exist for the type — a plain Error, surfaced as HTTP 500 — and a credentialId would
    // link an unrelated OAuth grant to a destination whose whole point is that it stores nothing.
    it('rejects inline credentials rather than resolving a validator that does not exist', async () => {
      const { service } = createService();
      const command = new CreateDataDestinationCommand({
        projectId: 'proj-1',
        title: 'Excel with credentials',
        type: DataDestinationType.EXCEL,
        userId: 'user-0',
        credentials: { type: 'google-sheets-credentials' } as never,
      });

      await expect(service.run(command)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('still creates one when nothing credential-bearing is supplied', async () => {
      const { service } = createService();
      const command = new CreateDataDestinationCommand({
        projectId: 'proj-1',
        title: 'Microsoft Excel',
        type: DataDestinationType.EXCEL,
        userId: 'user-0',
      });

      await expect(service.run(command)).resolves.toBeDefined();
    });
  });

  describe('inline-credential types', () => {
    it.each([
      [DataDestinationType.EMAIL, { type: 'email-credentials', to: ['team@example.com'] }],
      [DataDestinationType.SLACK, { type: 'email-credentials', to: ['team@example.com'] }],
      [DataDestinationType.MS_TEAMS, { type: 'email-credentials', to: ['team@example.com'] }],
    ])(
      'creates a %s Destination with its inline credentials and binds nothing',
      async (type, credentials) => {
        const { service, repository, destinationCredentials, dataDestinationCredentialService } =
          createService();

        await service.run(
          new CreateDataDestinationCommand({
            projectId: 'proj-1',
            title: 'Inline',
            type,
            userId: 'user-0',
            credentials: credentials as never,
          })
        );

        expect(dataDestinationCredentialService.create).toHaveBeenCalled();
        expect(repository.create).toHaveBeenCalledWith(
          expect.objectContaining({ type, credentialId: 'cred-1' })
        );
        expect(destinationCredentials.checkDestinationBinding).not.toHaveBeenCalled();
        expect(destinationCredentials.bindDestination).not.toHaveBeenCalled();
      }
    );
  });

  describe('Credentials', () => {
    const sheets = (overrides: Record<string, unknown> = {}) =>
      new CreateDataDestinationCommand({
        projectId: 'proj-1',
        title: 'Sheets',
        type: DataDestinationType.GOOGLE_SHEETS,
        userId: 'user-0',
        roles: ['editor'],
        reusableCredentialId: 'credential-1',
        ...overrides,
      });
    const chat = (overrides: Record<string, unknown> = {}) =>
      sheets({ title: 'Chat', type: DataDestinationType.GOOGLE_CHAT, ...overrides });

    it('checks the Credential first, checks the folder with it, and binds last', async () => {
      const {
        service,
        candidate,
        repository,
        destinationCredentials,
        dataDestinationCredentialService,
        credentialsResolver,
        folderValidator,
      } = createService();
      const member = {
        projectId: 'proj-1',
        userId: 'user-0',
        roles: ['editor'],
        credentialId: 'credential-1',
        type: DataDestinationType.GOOGLE_SHEETS,
      };

      await service.run(sheets());

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: DataDestinationType.GOOGLE_SHEETS, credentialId: null })
      );
      expect(dataDestinationCredentialService.create).not.toHaveBeenCalled();
      expect(destinationCredentials.checkDestinationBinding).toHaveBeenCalledWith(member);
      expect(folderValidator.validateConfiguredFolder).toHaveBeenCalledWith(savedEntity, candidate);
      expect(destinationCredentials.bindDestination).toHaveBeenCalledWith({
        ...member,
        destinationId: 'dest-1',
      });
      const order = (mock: jest.Mock) => mock.mock.invocationCallOrder[0];
      expect(order(destinationCredentials.checkDestinationBinding)).toBeLessThan(
        order(repository.save)
      );
      expect(order(folderValidator.validateConfiguredFolder)).toBeLessThan(
        order(destinationCredentials.bindDestination)
      );
      expect(order(syncOwners as jest.Mock)).toBeLessThan(
        order(destinationCredentials.bindDestination)
      );
      expect(order(destinationCredentials.bindDestination)).toBeLessThan(
        order(credentialsResolver.summarize)
      );
    });

    it('returns the bound Credential as the member sees it', async () => {
      const { service, credentialsResolver, mapper, summaries } = createService();

      await service.run(sheets());

      expect(credentialsResolver.summarize).toHaveBeenCalledWith(
        'proj-1',
        'user-0',
        ['editor'],
        [savedEntity]
      );
      expect(mapper.toDomainDto).toHaveBeenCalledWith(savedEntity, null, [], summaries);
    });

    it('creates nothing when the Credential check refuses', async () => {
      const { service, repository, destinationCredentials, folderValidator } = createService();
      destinationCredentials.checkDestinationBinding.mockRejectedValue(
        new ForbiddenException('You cannot use this Credential.')
      );

      await expect(service.run(sheets())).rejects.toThrow('You cannot use this Credential.');
      expect(repository.save).not.toHaveBeenCalled();
      expect(folderValidator.validateConfiguredFolder).not.toHaveBeenCalled();
      expect(destinationCredentials.bindDestination).not.toHaveBeenCalled();
    });

    it('binds nothing when the folder check fails', async () => {
      const { service, destinationCredentials, folderValidator } = createService();
      folderValidator.validateConfiguredFolder.mockRejectedValue(new Error('folder not usable'));

      await expect(service.run(sheets())).rejects.toThrow('folder not usable');
      expect(destinationCredentials.bindDestination).not.toHaveBeenCalled();
    });

    it('requires a Credential for a Google Sheets Destination', async () => {
      const { service, repository } = createService();

      await expect(service.run(sheets({ reusableCredentialId: undefined }))).rejects.toThrow(
        'reusableCredentialId is required for Google Sheets destinations.'
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('tells an older page that sends a service account key to reload, saving nothing', async () => {
      const { service, repository } = createService();

      await expect(
        service.run(
          sheets({
            reusableCredentialId: undefined,
            credentials: { type: 'google-sheets-credentials', serviceAccountKey: {} },
          })
        )
      ).rejects.toThrow('This page is out of date. Reload it.');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('stores Google Chat email recipients on the Destination without a bind', async () => {
      const { service, repository, destinationCredentials, dataDestinationCredentialService } =
        createService();

      await service.run(
        chat({
          reusableCredentialId: undefined,
          credentials: { type: 'email-credentials', to: ['team@example.com'] },
        })
      );

      expect(dataDestinationCredentialService.create).toHaveBeenCalled();
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ credentialId: 'cred-1' })
      );
      expect(destinationCredentials.bindDestination).not.toHaveBeenCalled();
    });

    it('binds a Google Chat webhook Credential', async () => {
      const { service, destinationCredentials, dataDestinationCredentialService } = createService();

      await service.run(chat());

      expect(destinationCredentials.bindDestination).toHaveBeenCalledWith(
        expect.objectContaining({ type: DataDestinationType.GOOGLE_CHAT, destinationId: 'dest-1' })
      );
      expect(dataDestinationCredentialService.create).not.toHaveBeenCalled();
    });

    it('requires a Credential or email recipients for a Google Chat Destination', async () => {
      const { service } = createService();

      await expect(service.run(chat({ reusableCredentialId: undefined }))).rejects.toThrow(
        'Google Chat destinations need reusableCredentialId or email credentials.'
      );
    });

    it('refuses a plugin that selects a Credential', async () => {
      const { service, repository } = createService();

      await expect(service.run(sheets({ isPluginCall: true }))).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(repository.save).not.toHaveBeenCalled();
    });
  });
});
