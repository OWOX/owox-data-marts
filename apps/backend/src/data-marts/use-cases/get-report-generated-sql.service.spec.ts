import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GetReportGeneratedSqlService } from './get-report-generated-sql.service';
import { GetReportGeneratedSqlCommand } from '../dto/domain/get-report-generated-sql.command';
import { EntityType, Action } from '../services/access-decision';

describe('GetReportGeneratedSqlService', () => {
  const report = {
    id: 'report-1',
    dataMart: {
      id: 'dm-1',
      storage: { id: 'storage-1', type: 'BIGQUERY' },
    },
    dataDestination: { id: 'dest-1' },
  };

  const createService = (canEditDataMart = true) => {
    const reportRepository = {
      findOne: jest.fn().mockResolvedValue(report),
    };
    const reportSqlComposerService = {
      compose: jest.fn().mockResolvedValue({ sql: 'SELECT 1' }),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(canEditDataMart),
    };

    const service = new GetReportGeneratedSqlService(
      reportRepository as never,
      reportSqlComposerService as never,
      accessDecisionService as never
    );

    return { service, reportRepository, reportSqlComposerService, accessDecisionService };
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns generated SQL when user has EDIT on source data mart', async () => {
    const { service, accessDecisionService, reportSqlComposerService } = createService(true);

    const command = new GetReportGeneratedSqlCommand('report-1', 'user-1', 'proj-1', ['editor']);

    const result = await service.run(command);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      'dm-1',
      Action.EDIT,
      'proj-1'
    );
    expect(reportSqlComposerService.compose).toHaveBeenCalledWith(report);
    expect(result).toEqual({ sql: 'SELECT 1' });
  });

  it('throws UnauthorizedException when userId is empty', async () => {
    const { service, accessDecisionService, reportRepository } = createService(true);

    const command = new GetReportGeneratedSqlCommand('report-1', '', 'proj-1', []);

    await expect(service.run(command)).rejects.toThrow(UnauthorizedException);
    expect(reportRepository.findOne).not.toHaveBeenCalled();
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when report is not found', async () => {
    const { service, reportRepository } = createService(true);
    reportRepository.findOne = jest.fn().mockResolvedValue(null);

    const command = new GetReportGeneratedSqlCommand('missing', 'user-1', 'proj-1', ['editor']);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when user lacks EDIT on source data mart', async () => {
    const { service, reportSqlComposerService } = createService(false);

    const command = new GetReportGeneratedSqlCommand('report-1', 'user-1', 'proj-1', ['viewer']);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
    expect(reportSqlComposerService.compose).not.toHaveBeenCalled();
  });
});
