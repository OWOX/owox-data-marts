import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { AiAssistantRunTriggerService } from './ai-assistant-run-trigger.service';

describe('AiAssistantRunTriggerService', () => {
  const createService = () => {
    const repository = {
      save: jest.fn(),
    };

    const service = new AiAssistantRunTriggerService(repository as never);

    return {
      service,
      repository,
    };
  };

  it('creates trigger for heavy routes', async () => {
    const { service, repository } = createService();
    repository.save.mockImplementation(async trigger => ({
      ...trigger,
      id: 'trigger-1',
    }));

    const triggerId = await service.createTrigger({
      userId: 'user-1',
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
      sessionId: 'session-1',
      userMessageId: 'message-1',
    });

    expect(triggerId).toBe('trigger-1');
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        projectId: 'project-1',
        dataMartId: 'data-mart-1',
        sessionId: 'session-1',
        userMessageId: 'message-1',
        status: TriggerStatus.IDLE,
        isActive: true,
      })
    );
  });
});
