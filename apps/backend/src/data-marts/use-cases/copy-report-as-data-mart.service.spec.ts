jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { CopyReportAsDataMartService } from './copy-report-as-data-mart.service';
import { CopyReportAsDataMartCommand } from '../dto/domain/copy-report-as-data-mart.command';
import { CreateDataMartCommand } from '../dto/domain/create-data-mart.command';
import { UpdateDataMartDefinitionCommand } from '../dto/domain/update-data-mart-definition.command';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
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

  const createdDataMart = { id: 'dm-new', title: 'Copy of My Report' };
  const finalDataMart = { id: 'dm-new', title: 'Copy of My Report', definitionType: 'SQL' };

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
    const createDataMartService = {
      run: jest.fn().mockResolvedValue(createdDataMart),
    };
    const updateDataMartDefinitionService = {
      run: jest.fn().mockResolvedValue(finalDataMart),
    };
    const accessDecisionService = {
      canAccess: jest.fn((_userId, _roles, entityType: EntityType) => {
        if (entityType === EntityType.DATA_MART)
          return Promise.resolve(accessResults.canEditDataMart);
        if (entityType === EntityType.STORAGE) return Promise.resolve(accessResults.canUseStorage);
        return Promise.resolve(false);
      }),
    };
    const blendableSchemaService = {
      assertNoInaccessibleReportRefs: jest.fn().mockResolvedValue(undefined),
    };

    const service = new CopyReportAsDataMartService(
      reportRepository as never,
      reportSqlComposerService as never,
      createDataMartService as never,
      updateDataMartDefinitionService as never,
      accessDecisionService as never,
      blendableSchemaService as never
    );

    return {
      service,
      reportRepository,
      reportSqlComposerService,
      createDataMartService,
      updateDataMartDefinitionService,
      accessDecisionService,
      blendableSchemaService,
    };
  };

  beforeEach(() => jest.clearAllMocks());

  it('delegates to CreateDataMartService and UpdateDataMartDefinitionService when user has EDIT on source DM and USE on storage', async () => {
    const {
      service,
      createDataMartService,
      updateDataMartDefinitionService,
      accessDecisionService,
    } = createService();

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

    expect(createDataMartService.run).toHaveBeenCalledWith(
      new CreateDataMartCommand('proj-1', 'user-1', 'Copy of My Report', 'storage-1', ['editor'])
    );
    expect(updateDataMartDefinitionService.run).toHaveBeenCalledWith(
      new UpdateDataMartDefinitionCommand(
        'dm-new',
        'proj-1',
        DataMartDefinitionType.SQL,
        { sqlQuery: 'SELECT 1' },
        undefined,
        undefined,
        'user-1',
        ['editor']
      )
    );

    expect(result).toEqual(finalDataMart);
  });

  it('runs the two use cases in the right order — create then update', async () => {
    const { service, createDataMartService, updateDataMartDefinitionService } = createService();

    const command = new CopyReportAsDataMartCommand('report-1', 'user-1', 'proj-1', ['editor']);
    await service.run(command);

    expect(createDataMartService.run.mock.invocationCallOrder[0]).toBeLessThan(
      updateDataMartDefinitionService.run.mock.invocationCallOrder[0]
    );
  });

  it('throws ForbiddenException when user lacks EDIT access on the source data mart', async () => {
    const { service } = createService({ canEditDataMart: false, canUseStorage: true });

    const command = new CopyReportAsDataMartCommand('report-1', 'user-1', 'proj-1', ['viewer']);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user lacks USE access on the source storage', async () => {
    const { service } = createService({ canEditDataMart: true, canUseStorage: false });

    const command = new CopyReportAsDataMartCommand('report-1', 'user-1', 'proj-1', ['editor']);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when the report does not exist', async () => {
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
    'rejects empty/whitespace SQL from composer with a BusinessViolationException and does not create a data mart',
    async emptySql => {
      const {
        service,
        reportSqlComposerService,
        createDataMartService,
        updateDataMartDefinitionService,
      } = createService();
      reportSqlComposerService.compose = jest.fn().mockResolvedValue({ sql: emptySql });

      const command = new CopyReportAsDataMartCommand('report-1', 'user-1', 'proj-1', ['editor']);

      await expect(service.run(command)).rejects.toThrow(BusinessViolationException);
      expect(createDataMartService.run).not.toHaveBeenCalled();
      expect(updateDataMartDefinitionService.run).not.toHaveBeenCalled();
    }
  );

  it('throws BusinessViolationException when report has inaccessible column/filter/sort refs', async () => {
    const { service, blendableSchemaService, createDataMartService } = createService();
    blendableSchemaService.assertNoInaccessibleReportRefs.mockRejectedValue(
      new BusinessViolationException(
        'Cannot copy report: columns reference inaccessible data marts: dm2__field_a'
      )
    );

    const command = new CopyReportAsDataMartCommand('report-1', 'user-1', 'proj-1', ['editor']);

    await expect(service.run(command)).rejects.toThrow(BusinessViolationException);
    await expect(service.run(command)).rejects.toThrow(
      'Cannot copy report: columns reference inaccessible data marts: dm2__field_a'
    );
    expect(createDataMartService.run).not.toHaveBeenCalled();
  });
});
