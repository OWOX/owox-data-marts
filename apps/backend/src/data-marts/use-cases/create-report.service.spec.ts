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

import { BadRequestException } from '@nestjs/common';
import { CreateReportService } from './create-report.service';
import { CreateReportCommand } from '../dto/domain/create-report.command';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { syncOwners } from '../utils/sync-owners';

describe('CreateReportService', () => {
  const dataMart = {
    id: 'dm-1',
    status: DataMartStatus.PUBLISHED,
    projectId: 'proj-1',
    storage: { type: DataStorageType.GOOGLE_BIGQUERY },
  };
  const dataDestination = { id: 'dest-1', type: 'LOOKER_STUDIO' };
  const savedReport = { id: 'report-1', createdById: 'user-0', owners: [], ownerIds: [] };

  const createService = (
    outputControlsValidatorOverride?: Partial<{ validateForReport: jest.Mock }>
  ) => {
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
      toDomainDto: jest
        .fn()
        .mockImplementation(
          (
            _entity: unknown,
            _createdByUser: unknown,
            _ownerUsers: unknown,
            capabilities?: { canRun: boolean; canManageTriggers: boolean; canEditConfig: boolean }
          ) => ({
            id: 'report-1',
            canRun: capabilities?.canRun ?? false,
            canManageTriggers: capabilities?.canManageTriggers ?? false,
            canEditConfig: capabilities?.canEditConfig ?? false,
          })
        ),
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
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    };
    const outputControlsValidator = {
      validateForReport: jest.fn().mockResolvedValue(undefined),
      ...outputControlsValidatorOverride,
    };
    const reportAccessService = {
      canOperate: jest.fn().mockResolvedValue(true),
      canMutate: jest.fn().mockResolvedValue(true),
      computeCapabilitiesForReport: jest.fn().mockResolvedValue({
        canRun: true,
        canManageTriggers: true,
        canEditConfig: true,
      }),
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
      accessDecisionService as never,
      eventDispatcher as never,
      outputControlsValidator as never,
      reportAccessService as never
    );

    return { service, reportRepository, outputControlsValidator };
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

  it('should call outputControlsValidator.validateForReport before create', async () => {
    const { service, outputControlsValidator } = createService();
    const command = new CreateReportCommand(
      'proj-1',
      'user-0',
      'Test',
      'dm-1',
      'dest-1',
      { type: 'looker-studio-config', cacheLifetime: 3600 } as never,
      undefined,
      [],
      undefined,
      [{ column: 'name', operator: 'eq', value: 'X' }],
      [{ column: 'name', direction: 'asc' }],
      100
    );

    await service.run(command);

    expect(outputControlsValidator.validateForReport).toHaveBeenCalledWith({
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      dataMartId: 'dm-1',
      projectId: 'proj-1',
      columnConfig: null,
      filterConfig: [{ column: 'name', operator: 'eq', value: 'X' }],
      sortConfig: [{ column: 'name', direction: 'asc' }],
      limitConfig: 100,
      aggregationConfig: null,
      dateTruncConfig: null,
      uniqueCountConfig: null,
      accessor: { userId: 'user-0', roles: [] },
    });
  });

  it('should propagate BadRequestException from outputControlsValidator', async () => {
    const validateForReport = jest
      .fn()
      .mockRejectedValue(new BadRequestException('Output controls validation failed'));
    const { service } = createService({ validateForReport });

    const command = new CreateReportCommand(
      'proj-1',
      'user-0',
      'Test',
      'dm-1',
      'dest-1',
      { type: 'looker-studio-config', cacheLifetime: 3600 } as never,
      undefined,
      [],
      undefined,
      [{ column: 'missing', operator: 'eq', value: 'X' }]
    );

    await expect(service.run(command)).rejects.toThrow(BadRequestException);
  });

  it('should pass new output control fields to reportRepository.create', async () => {
    const { service, reportRepository } = createService();
    const command = new CreateReportCommand(
      'proj-1',
      'user-0',
      'Test',
      'dm-1',
      'dest-1',
      { type: 'looker-studio-config', cacheLifetime: 3600 } as never,
      undefined,
      [],
      undefined,
      [{ column: 'name', operator: 'eq', value: 'X' }],
      [{ column: 'name', direction: 'asc' }],
      50
    );

    await service.run(command);

    expect(reportRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        filterConfig: [{ column: 'name', operator: 'eq', value: 'X' }],
        sortConfig: [{ column: 'name', direction: 'asc' }],
        limitConfig: 50,
      })
    );
  });

  it('should pass aggregationConfig to outputControlsValidator.validateForReport', async () => {
    const { service, outputControlsValidator } = createService();
    const command = new CreateReportCommand(
      'proj-1',
      'user-0',
      'Test',
      'dm-1',
      'dest-1',
      { type: 'looker-studio-config', cacheLifetime: 3600 } as never,
      undefined,
      [],
      undefined,
      null,
      null,
      null,
      [{ column: 'amount', function: 'SUM' }]
    );

    await service.run(command);

    expect(outputControlsValidator.validateForReport).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregationConfig: [{ column: 'amount', function: 'SUM' }],
      })
    );
  });

  it('should pass aggregationConfig to reportRepository.create', async () => {
    const { service, reportRepository } = createService();
    const command = new CreateReportCommand(
      'proj-1',
      'user-0',
      'Test',
      'dm-1',
      'dest-1',
      { type: 'looker-studio-config', cacheLifetime: 3600 } as never,
      undefined,
      [],
      undefined,
      null,
      null,
      null,
      [{ column: 'amount', function: 'SUM' }]
    );

    await service.run(command);

    expect(reportRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregationConfig: [{ column: 'amount', function: 'SUM' }],
      })
    );
  });

  it('should return DTO carrying capabilities computed for the creator', async () => {
    const { service } = createService();
    const command = new CreateReportCommand('proj-1', 'user-0', 'Test', 'dm-1', 'dest-1', {
      type: 'looker-studio-config',
      cacheLifetime: 3600,
    } as never);

    const result = await service.run(command);

    expect(result).toMatchObject({
      canRun: true,
      canManageTriggers: true,
      canEditConfig: true,
    });
  });
});
