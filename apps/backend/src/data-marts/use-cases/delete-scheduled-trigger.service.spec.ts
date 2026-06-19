import { ForbiddenException } from '@nestjs/common';
import { DeleteScheduledTriggerCommand } from '../dto/domain/delete-scheduled-trigger.command';
import { Action } from '../services/access-decision';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { DeleteScheduledTriggerService } from './delete-scheduled-trigger.service';

describe('DeleteScheduledTriggerService', () => {
  const connectorRunTrigger = {
    id: 'trigger-1',
    type: ScheduledTriggerType.CONNECTOR_RUN,
    dataMart: {
      id: 'dm-1',
    },
  };

  const createService = () => {
    const triggerRepository = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const scheduledTriggerService = {
      getByIdAndDataMartIdAndProjectId: jest.fn().mockResolvedValue(connectorRunTrigger),
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
      canAccessDmTrigger: jest.fn().mockResolvedValue(true),
    };

    const service = new DeleteScheduledTriggerService(
      triggerRepository as never,
      scheduledTriggerService as never,
      reportAccessService as never,
      reportService as never,
      accessDecisionService as never
    );

    return { service, triggerRepository, accessDecisionService };
  };

  const command = new DeleteScheduledTriggerCommand('trigger-1', 'dm-1', 'project-1', 'user-1', [
    'editor',
  ]);

  it('deletes connector-run triggers when Data Mart trigger management is allowed', async () => {
    const { service, triggerRepository, accessDecisionService } = createService();

    await expect(service.run(command)).resolves.toBeUndefined();

    expect(accessDecisionService.canAccessDmTrigger).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      'trigger-1',
      'dm-1',
      Action.MANAGE_TRIGGERS,
      'project-1'
    );
    expect(triggerRepository.delete).toHaveBeenCalledWith({
      id: 'trigger-1',
      dataMart: {
        id: 'dm-1',
        projectId: 'project-1',
      },
    });
  });

  it('rejects connector-run trigger deletes when Data Mart trigger management is denied', async () => {
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
    expect(triggerRepository.delete).not.toHaveBeenCalled();
  });
});
