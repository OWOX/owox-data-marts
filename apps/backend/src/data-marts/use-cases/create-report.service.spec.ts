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

jest.mock('../data-destination-types/facades/data-destination-access-validator.facade', () => ({
  DataDestinationAccessValidatorFacade: jest.fn(),
}));

jest.mock('../data-destination-types/available-destination-types.service', () => ({
  AvailableDestinationTypesService: jest.fn(),
}));

jest.mock('../utils/sync-owners', () => ({
  syncOwners: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/resolve-owner-users', () => ({
  resolveOwnerUsers: jest.fn().mockReturnValue([]),
}));

import { CreateReportService } from './create-report.service';
import { CreateReportCommand } from '../dto/domain/create-report.command';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { syncOwners } from '../utils/sync-owners';

describe('CreateReportService', () => {
  const dataMart = { id: 'dm-1', status: DataMartStatus.PUBLISHED, projectId: 'proj-1' };
  const dataDestination = { id: 'dest-1', type: 'LOOKER_STUDIO' };
  const savedReport = { id: 'report-1', createdById: 'user-0', owners: [], ownerIds: [] };

  const createService = () => {
    const reportRepository = {
      create: jest.fn().mockReturnValue(savedReport),
      save: jest.fn().mockResolvedValue(savedReport),
    };
    const reportOwnerRepository = {};
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
    };
    const dataDestinationService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataDestination),
    };
    const dataDestinationAccessValidationFacade = {
      checkAccess: jest.fn().mockResolvedValue(undefined),
    };
    const mapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: 'report-1' }),
    };
    const availableDestinationTypesService = {
      verifyIsAllowed: jest.fn(),
    };
    const userProjectionsFetcherService = {
      fetchUserProjectionsList: jest.fn().mockResolvedValue({
        getByUserId: jest.fn().mockReturnValue(null),
      }),
    };
    const idpProjectionsFacade = {};
    const eventDispatcher = {
      publishOnCommit: jest.fn().mockResolvedValue(undefined),
    };

    const service = new CreateReportService(
      reportRepository as never,
      reportOwnerRepository as never,
      dataMartService as never,
      dataDestinationService as never,
      dataDestinationAccessValidationFacade as never,
      mapper as never,
      availableDestinationTypesService as never,
      userProjectionsFetcherService as never,
      idpProjectionsFacade as never,
      eventDispatcher as never
    );

    return { service };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call syncOwners with creator userId when ownerIds not provided', async () => {
    const { service } = createService();
    const command = new CreateReportCommand('proj-1', 'user-0', 'Test', 'dm-1', 'dest-1', {
      type: 'looker-studio-config',
      cacheLifetime: 3600,
    } as never);

    await service.run(command);

    expect(syncOwners).toHaveBeenCalledWith(
      expect.anything(),
      'reportId',
      'report-1',
      'proj-1',
      ['user-0'],
      expect.anything(),
      expect.any(Function)
    );
  });

  it('should call syncOwners with provided ownerIds', async () => {
    const { service } = createService();
    const command = new CreateReportCommand(
      'proj-1',
      'user-0',
      'Test',
      'dm-1',
      'dest-1',
      { type: 'looker-studio-config', cacheLifetime: 3600 } as never,
      ['user-1', 'user-2']
    );

    await service.run(command);

    expect(syncOwners).toHaveBeenCalledWith(
      expect.anything(),
      'reportId',
      'report-1',
      'proj-1',
      ['user-1', 'user-2'],
      expect.anything(),
      expect.any(Function)
    );
  });
});
