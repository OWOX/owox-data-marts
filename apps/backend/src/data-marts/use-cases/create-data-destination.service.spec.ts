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
    };
    const googleOAuthClientService = {};
    const dataDestinationService = {};
    const copyCredentialService = {};
    const userProjectionsFetcherService = {
      fetchUserProjectionsList: jest.fn().mockResolvedValue({
        getByUserId: jest.fn().mockReturnValue(null),
      }),
    };
    const destinationOwnerRepository = {};
    const idpProjectionsFacade = {};

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
      idpProjectionsFacade as never
    );

    return { service };
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
});
