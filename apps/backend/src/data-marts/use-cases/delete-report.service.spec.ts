jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { DeleteReportService } from './delete-report.service';
import { DeleteReportCommand } from '../dto/domain/delete-report.command';
import { SearchableEntityType } from '../../common/search/search.facade';

describe('DeleteReportService', () => {
  const report = {
    id: 'report-1',
    dataMart: { id: 'dm-1', projectId: 'proj-1' },
    dataDestination: { id: 'dest-1', type: 'GOOGLE_SHEETS' },
    destinationConfig: {},
  };

  const createService = () => {
    const reportRepository = {
      findOne: jest.fn().mockResolvedValue(report),
    };
    const reportService = {
      deleteReport: jest.fn().mockResolvedValue(undefined),
    };
    const reportAccessService = {
      checkMutateAccess: jest.fn().mockResolvedValue(undefined),
    };
    const eventEmitter = {
      emit: jest.fn(),
    };
    const advancedSearchIndexSync = { scheduleDelete: jest.fn().mockResolvedValue(undefined) };

    const service = new DeleteReportService(
      reportRepository as never,
      reportService as never,
      reportAccessService as never,
      eventEmitter as never,
      advancedSearchIndexSync as never
    );

    return {
      service,
      reportRepository,
      reportService,
      reportAccessService,
      eventEmitter,
      advancedSearchIndexSync,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should delete report when access check passes', async () => {
    const { service, reportService, reportAccessService } = createService();

    const command = new DeleteReportCommand('report-1', 'proj-1', 'user-1', ['editor']);
    await service.run(command);

    expect(reportAccessService.checkMutateAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      'report-1',
      'proj-1'
    );
    expect(reportService.deleteReport).toHaveBeenCalledWith(report);
  });

  it('schedules removal of the report from the search index', async () => {
    const { service, advancedSearchIndexSync } = createService();

    await service.run(new DeleteReportCommand('report-1', 'proj-1', 'user-1', ['editor']));

    expect(advancedSearchIndexSync.scheduleDelete).toHaveBeenCalledWith(
      SearchableEntityType.REPORT,
      'report-1',
      'proj-1'
    );
  });

  it('should throw ForbiddenException when access check fails', async () => {
    const { service, reportAccessService } = createService();
    reportAccessService.checkMutateAccess.mockRejectedValue(
      new ForbiddenException('You are not an owner')
    );

    const command = new DeleteReportCommand('report-1', 'proj-1', 'user-1', ['viewer']);
    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException when report not found', async () => {
    const { service, reportRepository } = createService();
    reportRepository.findOne.mockResolvedValue(null);

    const command = new DeleteReportCommand('report-1', 'proj-1', 'user-1', ['editor']);
    await expect(service.run(command)).rejects.toThrow(NotFoundException);
  });
});
