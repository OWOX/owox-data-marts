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

describe('UpdateReportService', () => {
  const report = {
    id: 'report-1',
    title: 'Old Title',
    dataMart: { projectId: 'proj-1' },
    dataDestination: { id: 'dest-1', type: 'LOOKER_STUDIO' },
    destinationConfig: {},
    owners: [],
    ownerIds: [],
    createdById: 'user-0',
  };

  const createService = () => {
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
    const reportOwnerRepository = {};
    const reportAccessService = {
      checkMutateAccess: jest.fn().mockResolvedValue(undefined),
      canBeOwner: jest.fn().mockResolvedValue(true),
    };
    const reportDataCacheService = {
      invalidateByReportId: jest.fn().mockResolvedValue(undefined),
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
      reportDataCacheService as never
    );

    return { service, reportAccessService, reportRepository, reportDataCacheService };
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
    reportRepository.findOne
      .mockResolvedValueOnce(report)
      .mockResolvedValueOnce({ ...report, ownerIds: ['user-2', 'user-3'] });

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
    expect(reportAccessService.canBeOwner).toHaveBeenCalledWith('user-2', report, 'proj-1');
    expect(reportAccessService.canBeOwner).toHaveBeenCalledWith('user-3', report, 'proj-1');
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
});
