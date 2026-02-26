import {
  AiAssistantExecutionMode,
  AiAssistantMessageResultDto,
} from '../dto/domain/ai-assistant-message-result.dto';
import { CreateAiAssistantMessageCommand } from '../dto/domain/create-ai-assistant-message.command';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../enums/ai-assistant-scope.enum';
import { CreateAiAssistantMessageService } from './create-ai-assistant-message.service';

describe('CreateAiAssistantMessageService', () => {
  const command = new CreateAiAssistantMessageCommand(
    'session-1',
    'data-mart-1',
    'project-1',
    'user-1',
    'Build source',
    null
  );

  const session = {
    id: 'session-1',
    dataMartId: 'data-mart-1',
    scope: AiAssistantScope.TEMPLATE,
    title: 'Existing chat',
    templateId: 'template-1',
    artifactId: null,
    createdById: 'user-1',
  };

  const userMessageEntity = {
    id: 'message-user-1',
    sessionId: 'session-1',
    role: AiAssistantMessageRole.USER,
    content: 'Build source',
    meta: null,
    createdAt: new Date('2026-02-15T10:00:00.000Z'),
  };

  const assistantMessageEntity = {
    id: 'message-assistant-1',
    sessionId: 'session-1',
    role: AiAssistantMessageRole.ASSISTANT,
    content: 'Generated SQL candidate',
    meta: null,
    createdAt: new Date('2026-02-15T10:00:02.000Z'),
  };

  const createService = () => {
    const aiAssistantSessionService = {
      getSessionByIdAndDataMartIdAndProjectId: jest.fn(),
      addMessage: jest.fn(),
      listMessagesBySessionIdAndDataMartIdAndProjectId: jest.fn(),
      getLatestAppliedContextHints: jest.fn().mockResolvedValue(null),
      updateSessionTitleByIdAndDataMartIdAndProjectId: jest.fn(),
      updateMessageMetaByIdAndSessionId: jest.fn(),
    };
    const aiAssistantRunTriggerService = {
      createTrigger: jest.fn().mockResolvedValue('trigger-1'),
    };
    const mapper = {
      toDomainMessageDto: jest.fn(),
    };

    const service = new CreateAiAssistantMessageService(
      aiAssistantSessionService as never,
      aiAssistantRunTriggerService as never,
      mapper as never
    );

    return {
      service,
      aiAssistantSessionService,
      aiAssistantRunTriggerService,
      mapper,
    };
  };

  it('enqueues a routing job', async () => {
    const { service, aiAssistantSessionService, aiAssistantRunTriggerService } = createService();

    aiAssistantSessionService.getSessionByIdAndDataMartIdAndProjectId.mockResolvedValue(session);
    aiAssistantSessionService.addMessage
      .mockResolvedValueOnce(userMessageEntity)
      .mockResolvedValueOnce(assistantMessageEntity);
    aiAssistantSessionService.listMessagesBySessionIdAndDataMartIdAndProjectId.mockResolvedValue([
      userMessageEntity,
    ]);

    aiAssistantRunTriggerService.createTrigger.mockResolvedValue('trigger-1');

    const result = await service.run(command);

    expect(result).toBeInstanceOf(AiAssistantMessageResultDto);
    expect(result.mode).toBe(AiAssistantExecutionMode.HEAVY);
    expect(result.triggerId).toBe('trigger-1');
    expect(result.response).toBeNull();
    expect(aiAssistantRunTriggerService.createTrigger).toHaveBeenCalled();
  });

  it('enqueues a run for non-template session scope too', async () => {
    const { service, aiAssistantSessionService, aiAssistantRunTriggerService } = createService();
    aiAssistantSessionService.getSessionByIdAndDataMartIdAndProjectId.mockResolvedValue({
      ...session,
      scope: 'artifact' as AiAssistantScope,
      templateId: null,
    });
    aiAssistantSessionService.addMessage.mockResolvedValue(userMessageEntity);
    aiAssistantSessionService.listMessagesBySessionIdAndDataMartIdAndProjectId.mockResolvedValue(
      []
    );
    aiAssistantRunTriggerService.createTrigger.mockResolvedValue('trigger-1');

    await expect(service.run(command)).resolves.toBeInstanceOf(AiAssistantMessageResultDto);
    expect(aiAssistantRunTriggerService.createTrigger).toHaveBeenCalled();
  });
});
