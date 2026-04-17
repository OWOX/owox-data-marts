import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { InsightTemplateRunRequestedEvent } from '../events/insight-template-run-requested.event';
import { InsightTemplateRunTriggerService } from './insight-template-run-trigger.service';

describe('InsightTemplateRunTriggerService', () => {
  const createService = () => {
    const repository = {
      save: jest.fn(),
    };
    const eventDispatcher = {
      publishExternal: jest.fn().mockResolvedValue(undefined),
      publishExternalSafely: jest.fn(),
    };

    const service = new InsightTemplateRunTriggerService(
      repository as never,
      eventDispatcher as never
    );

    return {
      service,
      repository,
      eventDispatcher,
    };
  };

  it('creates manual trigger and emits run_requested event', async () => {
    const { service, repository, eventDispatcher } = createService();
    repository.save.mockImplementation(async trigger => ({
      ...trigger,
      id: 'trigger-1',
    }));

    const triggerId = await service.createTrigger({
      userId: 'user-1',
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
      insightTemplateId: 'template-1',
      type: 'manual',
    });

    expect(triggerId).toBe('trigger-1');
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        projectId: 'project-1',
        dataMartId: 'data-mart-1',
        insightTemplateId: 'template-1',
        status: TriggerStatus.IDLE,
        isActive: true,
      })
    );
    expect(eventDispatcher.publishExternalSafely).toHaveBeenCalledTimes(1);
    const [event] = eventDispatcher.publishExternalSafely.mock.calls[0];
    expect(event).toBeInstanceOf(InsightTemplateRunRequestedEvent);
    expect(event.payload).toEqual({
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
      userId: 'user-1',
      insightTemplateId: 'template-1',
      triggerId: 'trigger-1',
      type: 'manual',
    });
  });

  it('includes chat metadata in run_requested event', async () => {
    const { service, repository, eventDispatcher } = createService();
    repository.save.mockImplementation(async trigger => ({
      ...trigger,
      id: 'trigger-2',
    }));

    await service.createTrigger({
      userId: 'user-1',
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
      insightTemplateId: 'template-1',
      type: 'chat',
      assistantMessageId: '57bba70a-8ad8-4edc-8b3e-ec45f51dc486',
    });

    const [event] = eventDispatcher.publishExternalSafely.mock.calls[0];
    expect(event.payload).toEqual({
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
      userId: 'user-1',
      insightTemplateId: 'template-1',
      triggerId: 'trigger-2',
      type: 'chat',
      assistantMessageId: '57bba70a-8ad8-4edc-8b3e-ec45f51dc486',
    });
  });
});
