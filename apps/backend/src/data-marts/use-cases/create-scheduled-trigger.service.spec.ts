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
      canMutate: jest.fn().mockResolvedValue(true),
      isTechnicalUser: jest
        .fn()
        .mockImplementation(
          (roles: string[]) => roles.includes('editor') || roles.includes('admin')
        ),
    };

    const eventDispatcher = { publishExternal: jest.fn().mockResolvedValue(undefined) };

    const service = new CreateScheduledTriggerService(
      triggerRepository as never,
      scheduledTriggerValidatorFacade as never,
      dataMartService as never,
      mapper as never,
      eventDispatcher as never,
      reportAccessService as never
    );

    return { service, reportAccessService, triggerRepository };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow viewer to create REPORT_RUN trigger when they own the report', async () => {
    const { service, reportAccessService } = createService();
    reportAccessService.canMutate.mockResolvedValue(true);

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

    expect(reportAccessService.canMutate).toHaveBeenCalledWith(
      'user-2',
      ['viewer'],
      'report-1',
      'proj-1'
    );
  });

  it('should throw ForbiddenException when viewer does not own the report', async () => {
    const { service, reportAccessService } = createService();
    reportAccessService.canMutate.mockResolvedValue(false);

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
    const { service } = createService();

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
  });
});
