import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpdateScheduledTriggerCommand } from '../dto/domain/update-scheduled-trigger.command';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { Action } from '../services/access-decision';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { UpdateScheduledTriggerService } from './update-scheduled-trigger.service';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

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
      save: jest.fn().mockImplementation(trigger => Promise.resolve(trigger)),
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
      canAccess: jest.fn().mockResolvedValue(true),
      canAccessDmTrigger: jest.fn().mockResolvedValue(true),
    };

    const service = new UpdateScheduledTriggerService(
      triggerRepository as never,
      scheduledTriggerService as never,
      mapper as never,
      userProjectionsFetcherService as never,
      reportAccessService as never,
      reportService as never,
      accessDecisionService as never
    );

    return { service, triggerRepository, accessDecisionService, scheduledTriggerService };
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

  it.each([
    { cronExpression: 'invalid-cron', timeZone: 'UTC', isActive: true },
    { cronExpression: 'invalid-cron', timeZone: 'UTC', isActive: false },
    { cronExpression: '0 9 * * *', timeZone: 'invalid/timezone', isActive: true },
    { cronExpression: '0 9 * * *', timeZone: 'invalid/timezone', isActive: false },
  ])('rejects invalid schedule $cronExpression $timeZone with active=$isActive', async input => {
    const f = createService();
    const entity = Object.assign(new DataMartScheduledTrigger(), {
      ...connectorRunTrigger,
      scheduleNextRun: DataMartScheduledTrigger.prototype.scheduleNextRun,
    });
    f.scheduledTriggerService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(entity);
    const command = new UpdateScheduledTriggerCommand(
      'trigger-1',
      'dm-1',
      'project-1',
      'user-1',
      ['editor'],
      input.cronExpression,
      input.timeZone,
      input.isActive
    );

    await expect(f.service.run(command)).rejects.toThrow(BusinessViolationException);
    expect(f.triggerRepository.save).not.toHaveBeenCalled();
    expect(entity.cronExpression).toBe('0 9 * * *');
    expect(entity.timeZone).toBe('UTC');
  });

  it('validates the saved timezone when an inactive schedule update omits it', async () => {
    const f = createService();
    f.scheduledTriggerService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({
      ...connectorRunTrigger,
      timeZone: 'invalid/timezone',
      isActive: false,
    });

    await expect(
      f.service.run(
        new UpdateScheduledTriggerCommand(
          'trigger-1',
          'dm-1',
          'project-1',
          'user-1',
          ['editor'],
          '0 8 * * *'
        )
      )
    ).rejects.toThrow(BusinessViolationException);
    expect(f.triggerRepository.save).not.toHaveBeenCalled();
  });

  it('requires the same Data Mart SEE admission as HTTP before updating', async () => {
    const f = createService();
    f.accessDecisionService.canAccess.mockResolvedValue(false);
    await expect(f.service.run(command)).rejects.toThrow(ForbiddenException);
    expect(f.triggerRepository.save).not.toHaveBeenCalled();
    expect(f.accessDecisionService.canAccessDmTrigger).not.toHaveBeenCalled();
  });

  it.each([ScheduledTriggerType.REPORT_RUN, ScheduledTriggerType.DATA_QUALITY_RUN])(
    'refuses a mismatched expected type %s before mutation',
    async type => {
      const f = createService();
      f.scheduledTriggerService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({
        ...connectorRunTrigger,
        type,
      });
      await expect(
        f.service.run(
          new UpdateScheduledTriggerCommand(
            'trigger-1',
            'dm-1',
            'project-1',
            'user-1',
            ['editor'],
            '0 8 * * *',
            undefined,
            undefined,
            ScheduledTriggerType.CONNECTOR_RUN
          )
        )
      ).rejects.toThrow(NotFoundException);
      expect(f.triggerRepository.save).not.toHaveBeenCalled();
    }
  );

  it.each([true, false])(
    'preserves omitted timezone and active=%s through the real schedule entity',
    async isActive => {
      const f = createService();
      const entity = Object.assign(new DataMartScheduledTrigger(), {
        ...connectorRunTrigger,
        timeZone: 'America/New_York',
        isActive,
        scheduleNextRun: DataMartScheduledTrigger.prototype.scheduleNextRun,
        discardNextRun: DataMartScheduledTrigger.prototype.discardNextRun,
      });
      f.scheduledTriggerService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(entity);
      await f.service.run(
        new UpdateScheduledTriggerCommand(
          'trigger-1',
          'dm-1',
          'project-1',
          'user-1',
          ['editor'],
          '0 8 * * *',
          undefined,
          undefined
        )
      );
      expect(f.triggerRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          timeZone: 'America/New_York',
          isActive,
          cronExpression: '0 8 * * *',
        })
      );
      expect(entity.nextRunTimestamp).toEqual(isActive ? expect.any(Date) : null);
    }
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
    expect(triggerRepository.save).toHaveBeenCalled();
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
    expect(triggerRepository.save).not.toHaveBeenCalled();
  });
});
