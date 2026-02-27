import { AiAssistantMessage } from '../entities/ai-assistant-message.entity';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../enums/ai-assistant-scope.enum';
import { AgentFlowContextManager } from './agent-flow-context-manager.service';

describe('AgentFlowContextManager', () => {
  const createService = () => {
    const aiAssistantContextService = {
      getBySessionId: jest.fn(),
      saveIfChanged: jest.fn(),
    };
    const insightArtifactService = {
      listByIdsAndDataMartIdAndProjectId: jest.fn(),
    };
    const insightTemplateService = {
      getByIdAndDataMartIdAndProjectId: jest.fn(),
    };
    const aiAssistantSessionService = {
      listApplyActionSnapshotsBySession: jest.fn(),
    };
    const aiSourceApplyService = {
      listAppliedBySession: jest.fn(),
    };
    const historySnapshotAgent = {
      buildSnapshot: jest.fn(),
    };

    const service = new AgentFlowContextManager(
      aiAssistantContextService as never,
      insightArtifactService as never,
      insightTemplateService as never,
      aiAssistantSessionService as never,
      aiSourceApplyService as never,
      historySnapshotAgent as never
    );

    return {
      service,
      aiAssistantContextService,
      insightArtifactService,
      insightTemplateService,
      aiAssistantSessionService,
      aiSourceApplyService,
      historySnapshotAgent,
    };
  };

  it('creates conversation snapshot when timeline exceeds recent-turn limit', async () => {
    const {
      service,
      aiAssistantContextService,
      insightArtifactService,
      insightTemplateService,
      aiAssistantSessionService,
      aiSourceApplyService,
      historySnapshotAgent,
    } = createService();

    aiAssistantContextService.getBySessionId.mockResolvedValue(null);
    aiAssistantSessionService.listApplyActionSnapshotsBySession.mockResolvedValue([
      {
        id: 'apply-1',
        requestId: 'request-1',
        assistantMessageId: 'assistant-1',
        lifecycleStatus: 'applied',
        modifiedAt: new Date('2026-02-20T10:06:00.000Z'),
      },
      {
        id: 'apply-2',
        requestId: 'request-2',
        assistantMessageId: 'assistant-2',
        lifecycleStatus: 'created',
        modifiedAt: new Date('2026-02-20T10:07:00.000Z'),
      },
    ]);
    aiSourceApplyService.listAppliedBySession.mockResolvedValue([
      {
        actionType: 'update_existing_source',
        sourceKey: 'consumption_2025',
        artifactTitle: 'Consumption 2025',
        templateUpdated: true,
        appliedAt: new Date('2026-02-20T10:05:00.000Z'),
      },
    ]);
    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({
      sources: [
        {
          key: 'consumption_2025',
          artifactId: 'artifact-1',
        },
      ],
    });
    insightArtifactService.listByIdsAndDataMartIdAndProjectId.mockResolvedValue([
      {
        id: 'artifact-1',
        title: 'Consumption 2025',
        sql: 'SELECT 1',
        modifiedAt: new Date('2026-02-20T10:00:00.000Z'),
      },
    ]);
    historySnapshotAgent.buildSnapshot.mockResolvedValue({
      goal: 'Build monthly source',
      decisions: ['Refined SQL'],
      appliedChanges: ['Source was applied'],
      openQuestions: [],
      importantFacts: ['Template contains result section'],
      lastUserIntent: 'message 18',
    });

    const sessionMessages: AiAssistantMessage[] = Array.from({ length: 20 }).map((_, index) => ({
      id: `message-${index}`,
      sessionId: 'session-1',
      role: index % 2 === 0 ? AiAssistantMessageRole.USER : AiAssistantMessageRole.ASSISTANT,
      content: `message ${index}`,
      sqlCandidate: index === 19 || index === 17 ? `SELECT ${index} AS value` : null,
      createdAt: new Date(`2026-02-20T10:${String(index).padStart(2, '0')}:00.000Z`),
    })) as AiAssistantMessage[];

    const context = await service.buildPromptContext({
      session: {
        id: 'session-1',
        scope: AiAssistantScope.TEMPLATE,
        templateId: 'template-1',
      } as never,
      dataMartId: 'data-mart-1',
      projectId: 'project-1',
      userId: 'user-1',
      sessionMessages,
    });

    expect(historySnapshotAgent.buildSnapshot).toHaveBeenCalledTimes(1);
    expect(context.conversationSnapshot).toEqual(
      expect.objectContaining({
        goal: 'Build monthly source',
        compressedTurns: 18,
      })
    );
    expect(context.recentTurns).toHaveLength(3);
    expect(context.stateSnapshot.appliedActions).toHaveLength(1);
    expect(context.stateSnapshot.pendingActions).toHaveLength(1);
    expect(context.stateSnapshot.sqlRevisions).toEqual([
      expect.objectContaining({ sqlRevisionId: 'message-19', baseSqlHandle: 'rev:message-19' }),
      expect.objectContaining({ sqlRevisionId: 'message-17', baseSqlHandle: 'rev:message-17' }),
    ]);
    expect(aiAssistantContextService.saveIfChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        conversationSnapshot: expect.objectContaining({
          compressedTurns: 18,
        }),
      })
    );
  });

  it('keeps existing snapshot for small delta and drops stale pending actions', async () => {
    const {
      service,
      aiAssistantContextService,
      insightArtifactService,
      insightTemplateService,
      aiAssistantSessionService,
      aiSourceApplyService,
      historySnapshotAgent,
    } = createService();

    aiAssistantContextService.getBySessionId.mockResolvedValue({
      conversationSnapshot: {
        goal: 'Current goal',
        decisions: ['Decision A'],
        appliedChanges: ['Applied source'],
        openQuestions: [],
        importantFacts: ['Fact A'],
        lastUserIntent: 'Need SQL fix',
        compressedTurns: 10,
        updatedAt: '2026-02-20T10:00:00.000Z',
      },
    });
    aiAssistantSessionService.listApplyActionSnapshotsBySession.mockResolvedValue([
      {
        id: 'apply-created-old',
        requestId: 'request-created-old',
        assistantMessageId: 'assistant-created-old',
        lifecycleStatus: 'created',
        modifiedAt: new Date('2026-02-20T10:02:00.000Z'),
      },
      {
        id: 'apply-applied-new',
        requestId: 'request-applied-new',
        assistantMessageId: 'assistant-applied-new',
        lifecycleStatus: 'applied',
        modifiedAt: new Date('2026-02-20T10:07:00.000Z'),
      },
    ]);
    aiSourceApplyService.listAppliedBySession.mockResolvedValue([
      {
        actionType: 'update_existing_source',
        sourceKey: 'monthly_consumption_2025',
        artifactTitle: 'Monthly Consumption 2025',
        templateUpdated: true,
        appliedAt: new Date('2026-02-20T10:07:00.000Z'),
      },
    ]);
    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({
      sources: [],
    });
    insightArtifactService.listByIdsAndDataMartIdAndProjectId.mockResolvedValue([]);

    const sessionMessages: AiAssistantMessage[] = Array.from({ length: 14 }).map((_, index) => ({
      id: `message-${index}`,
      sessionId: 'session-1',
      role: index % 2 === 0 ? AiAssistantMessageRole.USER : AiAssistantMessageRole.ASSISTANT,
      content: `message ${index}`,
      sqlCandidate: null,
      createdAt: new Date(`2026-02-20T10:${String(index).padStart(2, '0')}:00.000Z`),
    })) as AiAssistantMessage[];

    const context = await service.buildPromptContext({
      session: {
        id: 'session-1',
        scope: AiAssistantScope.TEMPLATE,
        templateId: 'template-1',
      } as never,
      dataMartId: 'data-mart-1',
      projectId: 'project-1',
      userId: 'user-1',
      sessionMessages,
    });

    expect(historySnapshotAgent.buildSnapshot).not.toHaveBeenCalled();
    expect(context.conversationSnapshot).toEqual(
      expect.objectContaining({
        goal: 'Current goal',
        compressedTurns: 10,
      })
    );
    expect(context.stateSnapshot.appliedActions).toHaveLength(1);
    expect(context.stateSnapshot.pendingActions).toHaveLength(0);
    expect(context.stateSnapshot.sqlRevisions).toHaveLength(0);
  });
});
