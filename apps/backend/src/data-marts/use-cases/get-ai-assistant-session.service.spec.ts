import { AiAssistantMapper } from '../mappers/ai-assistant.mapper';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../enums/ai-assistant-scope.enum';
import { GetAiAssistantSessionCommand } from '../dto/domain/get-ai-assistant-session.command';
import { GetAiAssistantSessionService } from './get-ai-assistant-session.service';

describe('GetAiAssistantSessionService', () => {
  const createService = () => {
    const aiAssistantSessionService = {
      getSessionByIdAndDataMartIdAndProjectId: jest.fn(),
      listMessagesBySessionIdAndDataMartIdAndProjectId: jest.fn(),
      listApplyActionSnapshotsBySession: jest.fn(),
      getLatestAssistantMessageWithProposedActionsBySession: jest.fn(),
    };

    return {
      service: new GetAiAssistantSessionService(
        aiAssistantSessionService as never,
        new AiAssistantMapper()
      ),
      aiAssistantSessionService,
    };
  };

  const createCommand = () =>
    new GetAiAssistantSessionCommand('session-1', 'data-mart-1', 'project-1', 'user-1');

  it('returns proposedActions only for the latest action in session', async () => {
    const { service, aiAssistantSessionService } = createService();

    aiAssistantSessionService.getSessionByIdAndDataMartIdAndProjectId.mockResolvedValue({
      id: 'session-1',
      dataMartId: 'data-mart-1',
      scope: AiAssistantScope.TEMPLATE,
      title: 'Session',
      templateId: 'template-1',
      createdById: 'user-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    aiAssistantSessionService.listMessagesBySessionIdAndDataMartIdAndProjectId.mockResolvedValue([
      {
        id: 'assistant-message-1',
        sessionId: 'session-1',
        role: AiAssistantMessageRole.ASSISTANT,
        content: 'first',
        proposedActions: [
          {
            id: 'request-1',
            type: 'apply_sql_to_artifact',
            confidence: 0.9,
            payload: {},
          },
        ],
        sqlCandidate: null,
        meta: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'assistant-message-2',
        sessionId: 'session-1',
        role: AiAssistantMessageRole.ASSISTANT,
        content: 'second',
        proposedActions: [
          {
            id: 'request-2',
            type: 'apply_sql_to_artifact',
            confidence: 0.95,
            payload: {},
          },
          {
            id: 'request-2b',
            type: 'create_source_and_attach',
            confidence: 0.85,
            payload: {},
          },
        ],
        sqlCandidate: null,
        meta: null,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);
    aiAssistantSessionService.listApplyActionSnapshotsBySession.mockResolvedValue([]);
    aiAssistantSessionService.getLatestAssistantMessageWithProposedActionsBySession.mockResolvedValue(
      {
        id: 'assistant-message-2',
      }
    );

    const result = await service.run(createCommand());

    expect(result.messages[0]?.proposedActions).toBeNull();
    expect(result.messages[0]?.applyStatus).toBe('none');
    expect(result.messages[1]?.proposedActions).toHaveLength(2);
    expect(result.messages[1]?.proposedActions?.[0]?.id).toBe('request-2');
    expect(result.messages[1]?.proposedActions?.[1]?.id).toBe('request-2b');
    expect(result.messages[1]?.applyStatus).toBe('pending');
  });

  it('keeps applied status for old action while exposing only the latest action as pending', async () => {
    const { service, aiAssistantSessionService } = createService();

    aiAssistantSessionService.getSessionByIdAndDataMartIdAndProjectId.mockResolvedValue({
      id: 'session-1',
      dataMartId: 'data-mart-1',
      scope: AiAssistantScope.TEMPLATE,
      title: 'Session',
      templateId: 'template-1',
      createdById: 'user-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    aiAssistantSessionService.listMessagesBySessionIdAndDataMartIdAndProjectId.mockResolvedValue([
      {
        id: 'assistant-message-1',
        sessionId: 'session-1',
        role: AiAssistantMessageRole.ASSISTANT,
        content: 'first',
        proposedActions: [
          {
            id: 'request-1',
            type: 'apply_sql_to_artifact',
            confidence: 0.9,
            payload: {},
          },
        ],
        sqlCandidate: null,
        meta: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'assistant-message-2',
        sessionId: 'session-1',
        role: AiAssistantMessageRole.ASSISTANT,
        content: 'second',
        proposedActions: [
          {
            id: 'request-2',
            type: 'apply_sql_to_artifact',
            confidence: 0.95,
            payload: {},
          },
        ],
        sqlCandidate: null,
        meta: null,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);
    aiAssistantSessionService.listApplyActionSnapshotsBySession.mockResolvedValue([
      {
        id: 'apply-1',
        requestId: 'request-1',
        assistantMessageId: 'assistant-message-1',
        lifecycleStatus: 'applied',
        modifiedAt: new Date('2026-01-03T00:00:00.000Z'),
      },
    ]);
    aiAssistantSessionService.getLatestAssistantMessageWithProposedActionsBySession.mockResolvedValue(
      {
        id: 'assistant-message-2',
      }
    );

    const result = await service.run(createCommand());

    expect(result.messages[0]?.applyStatus).toBe('applied');
    expect(result.messages[0]?.proposedActions).toBeNull();
    expect(result.messages[1]?.applyStatus).toBe('pending');
    expect(result.messages[1]?.proposedActions).toHaveLength(1);
  });
});
