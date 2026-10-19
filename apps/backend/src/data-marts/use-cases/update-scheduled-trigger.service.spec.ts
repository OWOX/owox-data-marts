jest.mock('snowflake-sdk', () => ({ __esModule: true, default: {} }));
jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));
import { ForbiddenException } from '@nestjs/common';
import { UpdateScheduledTriggerCommand } from '../dto/domain/update-scheduled-trigger.command';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { Action } from '../services/access-decision';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { UpdateScheduledTriggerService } from './update-scheduled-trigger.service';

describe('UpdateScheduledTriggerService', () => {
  const connectorRunTrigger = {
    id: 'trigger-1',
    type: ScheduledTriggerType.CONNECTOR_RUN,
    cronExpression: '0 9 * * *',
    timeZone: 'UTC',
    isActive: true,
    dataMart: {
      id: 'dm-1',
      status: DataMartStatus.PUBLISHED,
    },
    scheduleNextRun: jest.fn(),
    discardNextRun: jest.fn(),
  };

  const createService = () => {
    const triggerRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const scheduledTriggerService = {
      getByIdAndDataMartIdAndProjectId: jest.fn().mockResolvedValue({
        ...connectorRunTrigger,
        scheduleNextRun: jest.fn(),
        discardNextRun: jest.fn(),
      }),
    };
    const mapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: 'trigger-1' }),
    };
    const userProjectionsFetcherService = {
      fetchCreatedByUser: jest.fn().mockResolvedValue(null),
    };
    const reportAccessService = {
      checkOperateAccess: jest.fn().mockResolvedValue(undefined),
      isTechnicalUser: jest
        .fn()
        .mockImplementation(
          (roles: string[]) => roles.includes('editor') || roles.includes('admin')
        ),
    };
    const reportService = {
      getByIdAndDataMartIdAndProjectId: jest.fn(),
    };
    const accessDecisionService = {
      canAccessStored: jest.fn().mockResolvedValue(true),
      canAccessDmTrigger: jest.fn().mockResolvedValue(true),
    };

    const service = new UpdateScheduledTriggerService(
      triggerRepository as never,
      scheduledTriggerService as never,
      mapper as never,
      userProjectionsFetcherService as never,
      reportAccessService as never,
      reportService as never,
      accessDecisionService as never,
      {
        lockConfigurationReferences: jest.fn().mockResolvedValue(undefined),
        advanceConfigurationRevision: jest.fn().mockResolvedValue(2),
      } as never
    );

    return { service, triggerRepository, accessDecisionService };
  };

  const command = new UpdateScheduledTriggerCommand(
    'trigger-1',
    'dm-1',
    'project-1',
    'user-1',
    ['editor'],
    '0 10 * * *',
    'UTC',
    true
  );

  it('updates connector-run triggers when Data Mart trigger management is allowed', async () => {
    const { service, triggerRepository, accessDecisionService } = createService();

    await expect(service.run(command)).resolves.toEqual({ id: 'trigger-1' });

    expect(accessDecisionService.canAccessDmTrigger).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      'trigger-1',
      'dm-1',
      Action.MANAGE_TRIGGERS,
      'project-1'
    );
    expect(triggerRepository.update).toHaveBeenCalled();
  });

  it('rejects connector-run trigger updates when Data Mart trigger management is denied', async () => {
    const { service, triggerRepository, accessDecisionService } = createService();
    accessDecisionService.canAccessDmTrigger.mockResolvedValueOnce(false);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);

    expect(accessDecisionService.canAccessDmTrigger).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      'trigger-1',
      'dm-1',
      Action.MANAGE_TRIGGERS,
      'project-1'
    );
    expect(triggerRepository.update).not.toHaveBeenCalled();
  });
});
