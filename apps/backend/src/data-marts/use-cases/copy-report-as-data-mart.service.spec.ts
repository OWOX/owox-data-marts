jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { CopyReportAsDataMartService } from './copy-report-as-data-mart.service';
import { CopyReportAsDataMartCommand } from '../dto/domain/copy-report-as-data-mart.command';
import { EntityType, Action } from '../services/access-decision';

describe('CopyReportAsDataMartService', () => {
  const report = {
    id: 'report-1',
    title: 'My Report',
    dataMart: {
      id: 'dm-1',
      storage: { id: 'storage-1', type: 'BIGQUERY' },
    },
    dataDestination: { id: 'dest-1' },
  };

  const newDataMart = { id: 'dm-new' };

  const createService = (accessResults: [boolean, boolean] = [true, true]) => {
    const reportRepository = {
      findOne: jest.fn().mockResolvedValue(report),
    };
    const reportSqlComposerService = {
      compose: jest.fn().mockResolvedValue({ sql: 'SELECT 1' }),
    };
    const dataMartService = {
      create: jest.fn().mockReturnValue(newDataMart),
      save: jest.fn().mockResolvedValue(newDataMart),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(accessResults[1]),
      canAccessReport: jest.fn().mockResolvedValue(accessResults[0]),
    };

    const service = new CopyReportAsDataMartService(
      reportRepository as never,
      reportSqlComposerService as never,
      dataMartService as never,
      accessDecisionService as never
    );

    return {
      service,
      reportRepository,
      reportSqlComposerService,
      dataMartService,
      accessDecisionService,
    };
  };

  beforeEach(() => jest.clearAllMocks());

  it('should copy report when user has RUN access on report and USE access on storage', async () => {
    const { service, dataMartService, accessDecisionService } = createService([true, true]);

    const command = new CopyReportAsDataMartCommand('report-1', 'user-1', 'proj-1', ['editor']);

    const result = await service.run(command);

    expect(accessDecisionService.canAccessReport).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      'report-1',
      'dm-1',
      Action.RUN,
      'proj-1'
    );
    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.STORAGE,
      'storage-1',
      Action.USE,
      'proj-1'
    );
    expect(dataMartService.save).toHaveBeenCalled();
    expect(result).toEqual(newDataMart);
  });

  it('should throw ForbiddenException when user lacks RUN access on report', async () => {
    const { service } = createService([false, true]);

    const command = new CopyReportAsDataMartCommand('report-1', 'user-1', 'proj-1', ['viewer']);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when user lacks USE access on storage', async () => {
    const { service } = createService([true, false]);

    const command = new CopyReportAsDataMartCommand('report-1', 'user-1', 'proj-1', ['editor']);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException when report not found', async () => {
    const { service, reportRepository } = createService([true, true]);
    reportRepository.findOne = jest.fn().mockResolvedValue(null);

    const command = new CopyReportAsDataMartCommand('report-1', 'user-1', 'proj-1', ['editor']);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
  });

  it('should skip access check when userId is empty', async () => {
    const { service, accessDecisionService } = createService([false, false]);

    const command = new CopyReportAsDataMartCommand('report-1', '', 'proj-1', []);

    await service.run(command);

    expect(accessDecisionService.canAccessReport).not.toHaveBeenCalled();
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
  });

  it.each(['', '   ', '\n\t  '])(
    'rejects empty/whitespace SQL from composer with a BusinessViolationException',
    async emptySql => {
      const { service, reportSqlComposerService, dataMartService } = createService([true, true]);
      reportSqlComposerService.compose = jest.fn().mockResolvedValue({ sql: emptySql });

      const command = new CopyReportAsDataMartCommand('report-1', 'user-1', 'proj-1', ['editor']);

      await expect(service.run(command)).rejects.toThrow(BusinessViolationException);
      expect(dataMartService.save).not.toHaveBeenCalled();
    }
  );
});
