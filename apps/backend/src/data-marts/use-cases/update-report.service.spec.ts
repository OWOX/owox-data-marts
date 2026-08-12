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

import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { UpdateReportService } from './update-report.service';
import { UpdateReportCommand } from '../dto/domain/update-report.command';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

describe('UpdateReportService', () => {
  const makeReport = () => ({
    id: 'report-1',
    title: 'Old Title',
    dataMart: {
      id: 'dm-1',
      projectId: 'proj-1',
      storage: { type: DataStorageType.GOOGLE_BIGQUERY },
    },
    dataDestination: { id: 'dest-1', type: 'LOOKER_STUDIO' },
    destinationConfig: {},
    columnConfig: null,
    filterConfig: null,
    sortConfig: null,
    limitConfig: null,
    owners: [],
    ownerIds: [],
    createdById: 'user-0',
  });

  const createService = (
    outputControlsValidatorOverride?: Partial<{ validateForReport: jest.Mock }>
  ) => {
    const report = makeReport();
    const reportRepository = {
      findOne: jest.fn().mockResolvedValue(report),
      save: jest.fn().mockResolvedValue(report),
    };
    const dataDestinationService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(report.dataDestination),
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
    const reportOwnerRepository = {};
    const reportAccessService = {
      checkMutateAccess: jest.fn().mockResolvedValue(undefined),
      canBeOwner: jest.fn().mockResolvedValue(true),
      canOperate: jest.fn().mockResolvedValue(true),
      canMutate: jest.fn().mockResolvedValue(true),
      computeCapabilitiesForReport: jest.fn().mockResolvedValue({
        canRun: true,
        canManageTriggers: true,
        canEditConfig: true,
      }),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    };
    const reportDataCacheService = {
      invalidateByReportId: jest.fn().mockResolvedValue(undefined),
    };
    const outputControlsValidator = {
      validateForReport: jest.fn().mockResolvedValue(undefined),
      ...outputControlsValidatorOverride,
    };

    const service = new UpdateReportService(
      reportRepository as never,
      dataDestinationService as never,
      dataDestinationAccessValidationFacade as never,
      mapper as never,
      availableDestinationTypesService as never,
      userProjectionsFetcherService as never,
      idpProjectionsFacade as never,
      reportOwnerRepository as never,
      reportAccessService as never,
      reportDataCacheService as never,
      outputControlsValidator as never,
      accessDecisionService as never
    );

    return {
      service,
      reportAccessService,
      accessDecisionService,
      reportRepository,
      reportDataCacheService,
      outputControlsValidator,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw ForbiddenException when access check fails', async () => {
    const { service, reportAccessService } = createService();
    reportAccessService.checkMutateAccess.mockRejectedValue(
      new ForbiddenException('You are not an owner')
    );

    const command = new UpdateReportCommand(
      'report-1',
      'proj-1',
      'user-1',
      ['viewer'],
      'New Title',
      'dest-1',
      {} as never
    );

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('should call checkMutateAccess with correct args', async () => {
    const { service, reportAccessService } = createService();

    const command = new UpdateReportCommand(
      'report-1',
      'proj-1',
      'user-1',
      ['editor'],
      'New Title',
      'dest-1',
      {} as never
    );

    await service.run(command);

    expect(reportAccessService.checkMutateAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      'report-1',
      'proj-1'
    );
  });

  it('should call canBeOwner for each new owner when ownerIds provided', async () => {
    const { service, reportAccessService, reportRepository } = createService();
    const localReport = makeReport();
    reportRepository.findOne
      .mockResolvedValueOnce(localReport)
      .mockResolvedValueOnce({ ...localReport, ownerIds: ['user-2', 'user-3'] });

    const command = new UpdateReportCommand(
      'report-1',
      'proj-1',
      'user-1',
      ['editor'],
      'New Title',
      'dest-1',
      {} as never,
      ['user-2', 'user-3']
    );

    await service.run(command);

    expect(reportAccessService.canBeOwner).toHaveBeenCalledTimes(2);
    expect(reportAccessService.canBeOwner).toHaveBeenCalledWith('user-2', localReport, 'proj-1');
    expect(reportAccessService.canBeOwner).toHaveBeenCalledWith('user-3', localReport, 'proj-1');
  });

  it('should throw BadRequestException when canBeOwner returns false', async () => {
    const { service, reportAccessService } = createService();
    reportAccessService.canBeOwner.mockResolvedValue(false);

    const command = new UpdateReportCommand(
      'report-1',
      'proj-1',
      'user-1',
      ['editor'],
      'New Title',
      'dest-1',
      {} as never,
      ['user-2']
    );

    await expect(service.run(command)).rejects.toThrow(BadRequestException);
  });

  it('should call outputControlsValidator.validateForReport with correct args', async () => {
    const { service, outputControlsValidator } = createService();

    const command = new UpdateReportCommand(
      'report-1',
      'proj-1',
      'user-1',
      ['editor'],
      'New Title',
      'dest-1',
      {} as never,
      undefined,
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
      accessor: { userId: 'user-1', roles: ['editor'] },
      // A save is where a joined Unique Count source that can never emit its column is refused;
      // the run path re-validates the same config and must keep degrading instead. Gated on the
      // selection actually changing — see the two tests below.
      rejectUnavailableUniqueCountSources: false,
    });
  });

  it('does not re-assert an unchanged joined Unique Count selection', async () => {
    const { service, outputControlsValidator, reportRepository } = createService();
    // A caller that round-trips the stored selection (MCP update_report, or any GET→PUT client)
    // asserts nothing new; rejecting would trap every later edit behind a source going stale.
    const stored = { ...makeReport(), uniqueCountConfig: ['orders'] };
    reportRepository.findOne.mockResolvedValue(stored);
    reportRepository.save.mockResolvedValue(stored);

    const command = new UpdateReportCommand(
      'report-1',
      'proj-1',
      'user-1',
      ['editor'],
      'Renamed',
      'dest-1',
      {} as never,
      undefined,
      undefined,
      null,
      null,
      null,
      null,
      null,
      ['orders']
    );

    await service.run(command);

    expect(outputControlsValidator.validateForReport).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueCountConfig: ['orders'],
        rejectUnavailableUniqueCountSources: false,
      })
    );
  });

  it('rejects an unavailable source when the joined Unique Count selection changes', async () => {
    const { service, outputControlsValidator, reportRepository } = createService();
    const stored = { ...makeReport(), uniqueCountConfig: ['orders'] };
    reportRepository.findOne.mockResolvedValue(stored);
    reportRepository.save.mockResolvedValue(stored);

    const command = new UpdateReportCommand(
      'report-1',
      'proj-1',
      'user-1',
      ['editor'],
      'New Title',
      'dest-1',
      {} as never,
      undefined,
      undefined,
      null,
      null,
      null,
      null,
      null,
      ['orders', 'orders.items']
    );

    await service.run(command);

    expect(outputControlsValidator.validateForReport).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueCountConfig: ['orders', 'orders.items'],
        rejectUnavailableUniqueCountSources: true,
      })
    );
  });

  it('should propagate BadRequestException from outputControlsValidator', async () => {
    const validateForReport = jest
      .fn()
      .mockRejectedValue(new BadRequestException('Output controls validation failed'));
    const { service } = createService({ validateForReport });

    const command = new UpdateReportCommand(
      'report-1',
      'proj-1',
      'user-1',
      ['editor'],
      'New Title',
      'dest-1',
      {} as never,
      undefined,
      undefined,
      [{ column: 'missing', operator: 'eq', value: 'X' }]
    );

    await expect(service.run(command)).rejects.toThrow(BadRequestException);
  });

  it('should invalidate cache when filterConfig changes', async () => {
    const { service, reportDataCacheService } = createService();

    const command = new UpdateReportCommand(
      'report-1',
      'proj-1',
      'user-1',
      ['editor'],
      'New Title',
      'dest-1',
      {} as never,
      undefined,
      undefined,
      [{ column: 'name', operator: 'eq', value: 'X' }]
    );

    await service.run(command);

    expect(reportDataCacheService.invalidateByReportId).toHaveBeenCalledWith('report-1');
  });

  it('should invalidate cache when sortConfig changes', async () => {
    const { service, reportDataCacheService } = createService();

    const command = new UpdateReportCommand(
      'report-1',
      'proj-1',
      'user-1',
      ['editor'],
      'New Title',
      'dest-1',
      {} as never,
      undefined,
      undefined,
      null,
      [{ column: 'name', direction: 'asc' }]
    );

    await service.run(command);

    expect(reportDataCacheService.invalidateByReportId).toHaveBeenCalledWith('report-1');
  });

  it('should invalidate cache when limitConfig changes', async () => {
    const { service, reportDataCacheService } = createService();

    const command = new UpdateReportCommand(
      'report-1',
      'proj-1',
      'user-1',
      ['editor'],
      'New Title',
      'dest-1',
      {} as never,
      undefined,
      undefined,
      null,
      null,
      50
    );

    await service.run(command);

    expect(reportDataCacheService.invalidateByReportId).toHaveBeenCalledWith('report-1');
  });

  it('should not invalidate cache when no output control configs change', async () => {
    const { service, reportDataCacheService } = createService();

    // command with same values as report (all null)
    const command = new UpdateReportCommand(
      'report-1',
      'proj-1',
      'user-1',
      ['editor'],
      'New Title',
      'dest-1',
      {} as never,
      undefined,
      undefined,
      null,
      null,
      null
    );

    await service.run(command);

    expect(reportDataCacheService.invalidateByReportId).not.toHaveBeenCalled();
  });

  it('should not invalidate cache when uniqueCountConfig is an unchanged source list', async () => {
    const { service, reportDataCacheService, reportRepository } = createService();
    // Every report form posts an array here, so a no-op save re-sends an equal-but-not-identical
    // one — a reference compare would invalidate the Looker cache on every save of every report.
    const stored = { ...makeReport(), uniqueCountConfig: ['orders'] };
    reportRepository.findOne.mockResolvedValue(stored);
    reportRepository.save.mockResolvedValue(stored);

    const command = new UpdateReportCommand(
      'report-1',
      'proj-1',
      'user-1',
      ['editor'],
      'New Title',
      'dest-1',
      {} as never,
      undefined,
      undefined,
      null,
      null,
      null,
      null,
      null,
      ['orders']
    );

    await service.run(command);

    expect(reportDataCacheService.invalidateByReportId).not.toHaveBeenCalled();
  });

  // A legacy report stores `true`; the web mapper reads that as [''] and posts it back unchanged.
  // Comparing the raw shapes made the first no-op save — a title rename — look like a config
  // change, re-billing a warehouse query for a config nobody touched.
  it.each([
    ['the legacy true against its array form', true as unknown, ['']],
    ['a stored empty list against null', [] as unknown, null],
  ])('should not invalidate cache for %s', async (_case, storedConfig, sentConfig) => {
    const { service, reportDataCacheService, reportRepository } = createService();
    const stored = { ...makeReport(), uniqueCountConfig: storedConfig as never };
    reportRepository.findOne.mockResolvedValue(stored);
    reportRepository.save.mockResolvedValue(stored);

    await service.run(
      new UpdateReportCommand(
        'report-1',
        'proj-1',
        'user-1',
        ['editor'],
        'New Title',
        'dest-1',
        {} as never,
        undefined,
        undefined,
        null,
        null,
        null,
        null,
        null,
        sentConfig as never
      )
    );

    expect(reportDataCacheService.invalidateByReportId).not.toHaveBeenCalled();
  });

  it('should invalidate cache when uniqueCountConfig sources change', async () => {
    const { service, reportDataCacheService, reportRepository } = createService();
    const stored = { ...makeReport(), uniqueCountConfig: ['orders'] };
    reportRepository.findOne.mockResolvedValue(stored);
    reportRepository.save.mockResolvedValue(stored);

    const command = new UpdateReportCommand(
      'report-1',
      'proj-1',
      'user-1',
      ['editor'],
      'New Title',
      'dest-1',
      {} as never,
      undefined,
      undefined,
      null,
      null,
      null,
      null,
      null,
      ['orders', 'orders.items']
    );

    await service.run(command);

    expect(reportDataCacheService.invalidateByReportId).toHaveBeenCalledWith('report-1');
  });

  it('should pass aggregationConfig to outputControlsValidator.validateForReport', async () => {
    const { service, outputControlsValidator } = createService();

    const command = new UpdateReportCommand(
      'report-1',
      'proj-1',
      'user-1',
      ['editor'],
      'New Title',
      'dest-1',
      {} as never,
      undefined,
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

  it('should invalidate cache when aggregationConfig changes', async () => {
    const { service, reportDataCacheService } = createService();

    const command = new UpdateReportCommand(
      'report-1',
      'proj-1',
      'user-1',
      ['editor'],
      'New Title',
      'dest-1',
      {} as never,
      undefined,
      undefined,
      null,
      null,
      null,
      [{ column: 'amount', function: 'SUM' }]
    );

    await service.run(command);

    expect(reportDataCacheService.invalidateByReportId).toHaveBeenCalledWith('report-1');
  });

  it('should return DTO carrying capabilities computed for the updater', async () => {
    const { service } = createService();

    const command = new UpdateReportCommand(
      'report-1',
      'proj-1',
      'user-1',
      ['editor'],
      'New Title',
      'dest-1',
      {} as never
    );

    const result = await service.run(command);

    expect(result).toMatchObject({
      canRun: true,
      canManageTriggers: true,
      canEditConfig: true,
    });
  });
});
