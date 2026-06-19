jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

jest.mock('../scheduled-trigger-types/facades/scheduled-trigger-validator.facade', () => ({
  ScheduledTriggerValidatorFacade: jest.fn(),
}));

import { ForbiddenException } from '@nestjs/common';
import { CreateScheduledTriggerService } from './create-scheduled-trigger.service';
import { CreateScheduledTriggerCommand } from '../dto/domain/create-scheduled-trigger.command';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { Action, EntityType } from '../services/access-decision';

describe('CreateScheduledTriggerService', () => {
  const dataMart = { id: 'dm-1', status: DataMartStatus.PUBLISHED, projectId: 'proj-1' };

  const createService = () => {
    const triggerRepository = {
      create: jest.fn().mockReturnValue({
        isActive: true,
        scheduleNextRun: jest.fn(),
        type: ScheduledTriggerType.REPORT_RUN,
      }),
      save: jest.fn().mockImplementation(t => Promise.resolve({ ...t, id: 'trigger-1' })),
    };
    const scheduledTriggerValidatorFacade = {
      validate: jest.fn().mockResolvedValue(undefined),
    };
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
    };
    const mapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: 'trigger-1' }),
    };
    const reportAccessService = {
      checkOperateAccess: jest.fn().mockResolvedValue(undefined),
      isTechnicalUser: jest
        .fn()
        .mockImplementation(
          (roles: string[]) => roles.includes('editor') || roles.includes('admin')
        ),
    };
    const accessDecisionService = {
      canAccess: jest
        .fn()
        .mockImplementation((_userId, roles: string[]) =>
          Promise.resolve(roles.includes('editor') || roles.includes('admin'))
        ),
    };

    const eventDispatcher = { publishExternal: jest.fn().mockResolvedValue(undefined) };

    const service = new CreateScheduledTriggerService(
      triggerRepository as never,
      scheduledTriggerValidatorFacade as never,
      dataMartService as never,
      mapper as never,
      eventDispatcher as never,
      reportAccessService as never,
      accessDecisionService as never
    );

    return { service, reportAccessService, triggerRepository, accessDecisionService };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow viewer to create REPORT_RUN trigger when they can operate the report', async () => {
    const { service, reportAccessService } = createService();

    const command = new CreateScheduledTriggerCommand(
      'proj-1',
      'user-2',
      'dm-1',
      ScheduledTriggerType.REPORT_RUN,
      '0 9 * * *',
      'UTC',
      true,
      { type: 'scheduled-report-run-config', reportId: 'report-1' } as never,
      ['viewer']
    );

    await service.run(command);

    expect(reportAccessService.checkOperateAccess).toHaveBeenCalledWith(
      'user-2',
      ['viewer'],
      'report-1',
      'proj-1'
    );
  });

  it('should throw ForbiddenException when viewer cannot operate the report', async () => {
    const { service, reportAccessService } = createService();
    reportAccessService.checkOperateAccess.mockRejectedValueOnce(
      new ForbiddenException('forbidden')
    );

    const command = new CreateScheduledTriggerCommand(
      'proj-1',
      'user-2',
      'dm-1',
      ScheduledTriggerType.REPORT_RUN,
      '0 9 * * *',
      'UTC',
      true,
      { type: 'scheduled-report-run-config', reportId: 'report-1' } as never,
      ['viewer']
    );

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when viewer tries to create CONNECTOR_RUN trigger', async () => {
    const { service } = createService();

    const command = new CreateScheduledTriggerCommand(
      'proj-1',
      'user-2',
      'dm-1',
      ScheduledTriggerType.CONNECTOR_RUN,
      '0 9 * * *',
      'UTC',
      true,
      undefined,
      ['viewer']
    );

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('should allow editor to create CONNECTOR_RUN trigger', async () => {
    const { service, accessDecisionService } = createService();

    const command = new CreateScheduledTriggerCommand(
      'proj-1',
      'user-1',
      'dm-1',
      ScheduledTriggerType.CONNECTOR_RUN,
      '0 9 * * *',
      'UTC',
      true,
      undefined,
      ['editor']
    );

    await expect(service.run(command)).resolves.toBeDefined();
    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      'dm-1',
      Action.MANAGE_TRIGGERS,
      'proj-1'
    );
  });

  it('should reject editor creating CONNECTOR_RUN trigger without Data Mart trigger management access', async () => {
    const { service, accessDecisionService } = createService();
    accessDecisionService.canAccess.mockResolvedValueOnce(false);

    const command = new CreateScheduledTriggerCommand(
      'proj-1',
      'user-1',
      'dm-1',
      ScheduledTriggerType.CONNECTOR_RUN,
      '0 9 * * *',
      'UTC',
      true,
      undefined,
      ['editor']
    );

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      'dm-1',
      Action.MANAGE_TRIGGERS,
      'proj-1'
    );
  });

  it('allows viewer who can operate the report (BO DM) to create REPORT_RUN trigger', async () => {
    const { service, reportAccessService } = createService();

    const command = new CreateScheduledTriggerCommand(
      'proj-1',
      'user-2',
      'dm-1',
      ScheduledTriggerType.REPORT_RUN,
      '0 9 * * *',
      'UTC',
      true,
      { type: 'scheduled-report-run-config', reportId: 'report-1' } as never,
      ['viewer']
    );

    await expect(service.run(command)).resolves.toBeDefined();
    expect(reportAccessService.checkOperateAccess).toHaveBeenCalledWith(
      'user-2',
      ['viewer'],
      'report-1',
      'proj-1'
    );
  });

  it('rejects when checkOperateAccess throws for REPORT_RUN', async () => {
    const { service, reportAccessService } = createService();
    reportAccessService.checkOperateAccess.mockRejectedValueOnce(
      new ForbiddenException('forbidden')
    );

    const command = new CreateScheduledTriggerCommand(
      'proj-1',
      'user-2',
      'dm-1',
      ScheduledTriggerType.REPORT_RUN,
      '0 9 * * *',
      'UTC',
      true,
      { type: 'scheduled-report-run-config', reportId: 'report-1' } as never,
      ['viewer']
    );

    await expect(service.run(command)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
