jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
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

  const createService = (
    accessResults: { canEditDataMart: boolean; canUseStorage: boolean } = {
      canEditDataMart: true,
      canUseStorage: true,
    }
  ) => {
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
      canAccess: jest.fn((_userId, _roles, entityType: EntityType) => {
        if (entityType === EntityType.DATA_MART)
          return Promise.resolve(accessResults.canEditDataMart);
        if (entityType === EntityType.STORAGE) return Promise.resolve(accessResults.canUseStorage);
        return Promise.resolve(false);
      }),
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

  it('should copy report when user has EDIT access on parent data mart and USE access on storage', async () => {
    const { service, dataMartService, accessDecisionService } = createService();

    const command = new CopyReportAsDataMartCommand('report-1', 'user-1', 'proj-1', ['editor']);

    const result = await service.run(command);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      'dm-1',
      Action.EDIT,
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

  it('should throw ForbiddenException when user lacks EDIT access on parent data mart', async () => {
    const { service } = createService({ canEditDataMart: false, canUseStorage: true });

    const command = new CopyReportAsDataMartCommand('report-1', 'user-1', 'proj-1', ['viewer']);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when user lacks USE access on storage', async () => {
    const { service } = createService({ canEditDataMart: true, canUseStorage: false });

    const command = new CopyReportAsDataMartCommand('report-1', 'user-1', 'proj-1', ['editor']);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException when report not found', async () => {
    const { service, reportRepository } = createService();
    reportRepository.findOne = jest.fn().mockResolvedValue(null);

    const command = new CopyReportAsDataMartCommand('report-1', 'user-1', 'proj-1', ['editor']);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
  });

  it('throws UnauthorizedException when userId is empty', async () => {
    const { service, accessDecisionService, reportRepository } = createService({
      canEditDataMart: true,
      canUseStorage: true,
    });

    const command = new CopyReportAsDataMartCommand('report-1', '', 'proj-1', []);

    await expect(service.run(command)).rejects.toThrow(UnauthorizedException);
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
    expect(reportRepository.findOne).not.toHaveBeenCalled();
  });

  it.each(['', '   ', '\n\t  '])(
    'rejects empty/whitespace SQL from composer with a BusinessViolationException',
    async emptySql => {
      const { service, reportSqlComposerService, dataMartService } = createService();
      reportSqlComposerService.compose = jest.fn().mockResolvedValue({ sql: emptySql });

      const command = new CopyReportAsDataMartCommand('report-1', 'user-1', 'proj-1', ['editor']);

      await expect(service.run(command)).rejects.toThrow(BusinessViolationException);
      expect(dataMartService.save).not.toHaveBeenCalled();
    }
  );
});
