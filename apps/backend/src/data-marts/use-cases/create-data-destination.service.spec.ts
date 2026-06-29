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

jest.mock('../data-destination-types/available-destination-types.service', () => ({
  AvailableDestinationTypesService: jest.fn(),
}));

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
    const availableDestinationTypesService = {
      verifyIsAllowed: jest.fn(),
    };
    const dataDestinationCredentialService = {
      create: jest.fn().mockResolvedValue({ id: 'cred-1' }),
      getById: jest.fn(),
    };
    const googleOAuthClientService = {
      getDestinationOAuth2ClientByCredentialId: jest.fn().mockResolvedValue({
        getAccessToken: jest.fn().mockResolvedValue(undefined),
      }),
    };
    const dataDestinationService = {};
    const copyCredentialService = {};
    const userProjectionsFetcherService = {
      fetchUserProjectionsList: jest.fn().mockResolvedValue({
        getByUserId: jest.fn().mockReturnValue(null),
      }),
    };
    const destinationOwnerRepository = {};
    const idpProjectionsFacade = {};
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    };

    const eventDispatcher = { publishLocalOnCommit: jest.fn() };

    const folderValidator = { validateConfiguredFolder: jest.fn().mockResolvedValue(undefined) };

    const service = new CreateDataDestinationService(
      repository as never,
      mapper as never,
      credentialsValidator as never,
      credentialsProcessor as never,
      availableDestinationTypesService as never,
      dataDestinationCredentialService as never,
      googleOAuthClientService as never,
      dataDestinationService as never,
      copyCredentialService as never,
      userProjectionsFetcherService as never,
      destinationOwnerRepository as never,
      idpProjectionsFacade as never,
      accessDecisionService as never,
      eventDispatcher as never,
      folderValidator as never
    );

    return {
      service,
      dataDestinationCredentialService,
      googleOAuthClientService,
      repository,
      accessDecisionService,
      folderValidator,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call syncOwners with creator userId when ownerIds not provided', async () => {
    const { service } = createService();
    const command = new CreateDataDestinationCommand(
      'proj-1',
      'Test Dest',
      DataDestinationType.LOOKER_STUDIO,
      'user-0',
      { type: 'looker-studio-credentials' } as never
    );

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
    const command = new CreateDataDestinationCommand(
      'proj-1',
      'Test Dest',
      DataDestinationType.LOOKER_STUDIO,
      'user-0',
      { type: 'looker-studio-credentials' } as never
    );

    await service.run(command);

    const repository = (service as unknown as { repository: { create: jest.Mock } }).repository;
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        availableForUse: true,
        availableForMaintenance: false,
      })
    );
  });

  it('always validates the configured folder on create (a new folder is always "changed")', async () => {
    const { service, folderValidator } = createService();
    const command = new CreateDataDestinationCommand(
      'proj-1',
      'Test Dest',
      DataDestinationType.LOOKER_STUDIO,
      'user-0',
      { type: 'looker-studio-credentials' } as never
    );

    await service.run(command);

    expect(folderValidator.validateConfiguredFolder).toHaveBeenCalledTimes(1);
    expect(folderValidator.validateConfiguredFolder).toHaveBeenCalledWith(savedEntity);
  });

  it('should call syncOwners with provided ownerIds', async () => {
    const { service } = createService();
    const command = new CreateDataDestinationCommand(
      'proj-1',
      'Test Dest',
      DataDestinationType.LOOKER_STUDIO,
      'user-0',
      { type: 'looker-studio-credentials' } as never,
      undefined,
      undefined,
      ['user-1', 'user-2']
    );

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

  describe('credentialId ownership check', () => {
    it('throws ForbiddenException when credentialId belongs to a different project', async () => {
      const { service, dataDestinationCredentialService } = createService();
      dataDestinationCredentialService.getById.mockResolvedValue({
        id: 'cred-1',
        projectId: 'other-project',
      });

      const command = new CreateDataDestinationCommand(
        'proj-1',
        'Test',
        DataDestinationType.GOOGLE_SHEETS,
        'user-0',
        undefined,
        'cred-1'
      );

      await expect(service.run(command)).rejects.toThrow(
        'Credential does not belong to this project'
      );
    });

    it('throws ForbiddenException when credentialId does not exist', async () => {
      const { service, dataDestinationCredentialService } = createService();
      dataDestinationCredentialService.getById.mockResolvedValue(null);

      const command = new CreateDataDestinationCommand(
        'proj-1',
        'Test',
        DataDestinationType.GOOGLE_SHEETS,
        'user-0',
        undefined,
        'cred-missing'
      );

      await expect(service.run(command)).rejects.toThrow(
        'Credential does not belong to this project'
      );
    });

    it('creates destination when credentialId belongs to the same project and is not yet linked', async () => {
      const { service, dataDestinationCredentialService, googleOAuthClientService } =
        createService();
      dataDestinationCredentialService.getById.mockResolvedValue({
        id: 'cred-1',
        projectId: 'proj-1',
      });

      const command = new CreateDataDestinationCommand(
        'proj-1',
        'Test',
        DataDestinationType.GOOGLE_SHEETS,
        'user-0',
        undefined,
        'cred-1'
      );

      const result = await service.run(command);

      expect(
        googleOAuthClientService.getDestinationOAuth2ClientByCredentialId
      ).toHaveBeenCalledWith('cred-1');
      expect(result).toEqual({ id: 'dest-1' });
    });

    it('rejects credential already linked to another destination when caller lacks COPY_CREDENTIALS', async () => {
      const { service, dataDestinationCredentialService, repository, accessDecisionService } =
        createService();
      dataDestinationCredentialService.getById.mockResolvedValue({
        id: 'cred-1',
        projectId: 'proj-1',
      });
      repository.findOne.mockResolvedValue({ id: 'existing-dest', credentialId: 'cred-1' });
      accessDecisionService.canAccess.mockResolvedValue(false);

      const command = new CreateDataDestinationCommand(
        'proj-1',
        'Test',
        DataDestinationType.GOOGLE_SHEETS,
        'user-0',
        undefined,
        'cred-1'
      );

      await expect(service.run(command)).rejects.toThrow(
        'You do not have permission to copy credentials from this destination'
      );
      expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
        'user-0',
        [],
        'DESTINATION',
        'existing-dest',
        'COPY_CREDENTIALS',
        'proj-1'
      );
    });

    it('accepts credential already linked to another destination when caller has COPY_CREDENTIALS', async () => {
      const {
        service,
        dataDestinationCredentialService,
        repository,
        accessDecisionService,
        googleOAuthClientService,
      } = createService();
      dataDestinationCredentialService.getById.mockResolvedValue({
        id: 'cred-1',
        projectId: 'proj-1',
      });
      repository.findOne.mockResolvedValue({ id: 'existing-dest', credentialId: 'cred-1' });
      accessDecisionService.canAccess.mockResolvedValue(true);

      const command = new CreateDataDestinationCommand(
        'proj-1',
        'Test',
        DataDestinationType.GOOGLE_SHEETS,
        'user-0',
        undefined,
        'cred-1'
      );

      const result = await service.run(command);

      expect(
        googleOAuthClientService.getDestinationOAuth2ClientByCredentialId
      ).toHaveBeenCalledWith('cred-1');
      expect(result).toEqual({ id: 'dest-1' });
    });
  });
});
