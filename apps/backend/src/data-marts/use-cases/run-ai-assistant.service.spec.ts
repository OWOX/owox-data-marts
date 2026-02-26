jest.mock('../ai-insights/agent-flow/agent-flow.service');
jest.mock('@owox/internal-helpers', () => ({
  formatDuration: (value: number) => `${value}ms`,
  castError: (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
}));

import { RunType } from '../../common/scheduler/shared/types';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../enums/ai-assistant-scope.enum';
import { RunAiAssistantCommand } from './run-ai-assistant.service';
import { RunAiAssistantService } from './run-ai-assistant.service';

describe('RunAiAssistantService', () => {
  const now = new Date('2026-02-15T12:00:00.000Z');
  const command = new RunAiAssistantCommand(
    'data-mart-1',
    'project-1',
    'session-1',
    'user-1',
    'user-message-1'
  );

  const dataMart = {
    id: 'data-mart-1',
    definition: {
      type: 'sql',
      query: 'select 1',
      fullyQualifiedName: 'project.dataset.table',
    },
  };

  const session = {
    id: 'session-1',
    scope: AiAssistantScope.TEMPLATE,
    templateId: 'template-1',
    artifactId: 'artifact-1',
    createdById: 'user-1',
  };

  const run = {
    id: 'run-1',
    status: DataMartRunStatus.PENDING,
    logs: [],
    errors: [],
  };

  const userMessage = {
    id: 'user-message-1',
    role: AiAssistantMessageRole.USER,
    content: 'Generate source for purchases',
    meta: {
      correlationId: 'corr-1',
      routeTrace: {
        route: 'refine_existing_source_sql',
        finalRoute: 'refine_existing_source_sql',
        reasonDescription: 'Matched route',
        promptType: 'source_task',
        sourceTaskMode: 'refine_existing',
        path: 'source_task>refine_existing>source_resolver>single_source_fallback>refine_existing_source_sql',
        decisionTraceId: 'session-1:user-message-1',
        nodeDecisions: {
          classifier1: {
            decision: 'source_task',
            confidence: 0.94,
          },
          classifier2: {
            decision: 'refine_existing',
            confidence: 0.87,
          },
          resolver: {
            decision: 'source_intent_match',
            topCandidates: [
              {
                sourceKey: 'consumption_2025',
                artifactId: 'artifact-1',
                confidence: 0.92,
                reason: 'High-confidence implicit match. Keep this safe.',
              },
            ],
          },
          finalRoute: 'refine_existing_source_sql',
        },
        resolvedContext: {
          targetSourceKey: 'consumption_2025',
          targetArtifactId: 'artifact-1',
          targetKind: 'TABLE',
          contextResolution: 'inferred_key',
        },
        matchConfidence: 0.92,
        matchReason: 'High-confidence implicit match.\nKeep this safe.',
      },
    },
    createdAt: new Date('2026-02-15T11:59:50.000Z'),
  };

  const assistantMessage = {
    id: 'assistant-message-1',
    role: AiAssistantMessageRole.ASSISTANT,
    content: 'SQL candidate is ready.',
    createdAt: new Date('2026-02-15T12:00:10.000Z'),
  };

  const promptContext = {
    recentTurns: [
      {
        role: AiAssistantMessageRole.USER,
        content: userMessage.content,
        createdAt: userMessage.createdAt.toISOString(),
      },
    ],
    conversationSnapshot: {
      goal: 'Generate source for purchases',
      decisions: [],
      appliedChanges: [],
      openQuestions: [],
      importantFacts: [],
      lastUserIntent: 'Generate source for purchases',
      compressedTurns: 2,
      updatedAt: now.toISOString(),
    },
    stateSnapshot: {
      sessionId: 'session-1',
      templateId: 'template-1',
      sources: [],
      appliedActions: [],
      pendingActions: [],
      sqlRevisions: [],
    },
  };

  const createService = () => {
    const dataMartService = {
      getByIdAndProjectId: jest.fn(),
    };
    const dataMartRunService = {
      createAndMarkAiSourceRunAsPending: jest.fn(),
      markAiSourceRunAsStarted: jest.fn(),
      markAiSourceRunAsFinished: jest.fn(),
    };
    const aiAssistantSessionService = {
      getSessionByIdAndDataMartIdAndProjectId: jest.fn(),
      listMessagesBySessionIdAndDataMartIdAndProjectId: jest.fn(),
      addMessage: jest.fn(),
    };
    const agentFlowService = {
      run: jest.fn(),
    };
    const agentFlowContextManager = {
      buildPromptContext: jest.fn().mockResolvedValue(promptContext),
    };
    const systemTimeService = {
      now: jest.fn(),
    };

    const service = new RunAiAssistantService(
      dataMartService as never,
      dataMartRunService as never,
      aiAssistantSessionService as never,
      agentFlowService as never,
      agentFlowContextManager as never,
      systemTimeService as never
    );

    return {
      service,
      dataMartService,
      dataMartRunService,
      aiAssistantSessionService,
      agentFlowService,
      agentFlowContextManager,
      systemTimeService,
    };
  };

  it('creates run, completes SUCCESS and appends assistant message', async () => {
    const {
      service,
      dataMartService,
      dataMartRunService,
      aiAssistantSessionService,
      agentFlowService,
      systemTimeService,
    } = createService();

    dataMartService.getByIdAndProjectId.mockResolvedValue(dataMart);
    aiAssistantSessionService.getSessionByIdAndDataMartIdAndProjectId.mockResolvedValue(session);
    dataMartRunService.createAndMarkAiSourceRunAsPending.mockResolvedValue(run);
    dataMartRunService.markAiSourceRunAsStarted.mockResolvedValue({
      ...run,
      status: DataMartRunStatus.RUNNING,
    });
    aiAssistantSessionService.listMessagesBySessionIdAndDataMartIdAndProjectId.mockResolvedValue([
      userMessage,
    ]);
    agentFlowService.run.mockResolvedValue({
      status: 'ok',
      decision: 'propose_action',
      result: {
        sqlCandidate: 'select * from users',
        dryRun: { isValid: true, bytes: 1234 },
      },
      explanation: 'SQL candidate is ready.',
      meta: {
        lastUserMessage: 'Generate source for purchases',
        sanitizedLastUserMessage: 'Generate source for purchases',
        reasonDescription: 'Ready',
        telemetry: {
          llmCalls: [
            {
              usage: {
                executionTime: 120,
                promptTokens: 100,
                completionTokens: 30,
                reasoningTokens: 0,
                totalTokens: 130,
              },
              finishReason: 'stop',
            },
          ],
          toolCalls: [{ success: true }],
          messageHistory: [],
        },
      },
    });
    aiAssistantSessionService.addMessage.mockResolvedValue(assistantMessage);
    systemTimeService.now.mockReturnValue(now);

    const result = await service.run(command);

    expect(result.runId).toBe('run-1');
    expect(result.assistantMessageId).toBe('assistant-message-1');

    expect(dataMartRunService.createAndMarkAiSourceRunAsPending).toHaveBeenCalledWith(
      dataMart,
      session,
      expect.objectContaining({
        createdById: 'user-1',
        runType: RunType.manual,
        turnId: 'user-message-1',
      })
    );
    expect(dataMartRunService.markAiSourceRunAsStarted).toHaveBeenCalledWith(run);
    expect(dataMartRunService.markAiSourceRunAsFinished).toHaveBeenCalledWith(
      run,
      expect.objectContaining({
        status: DataMartRunStatus.SUCCESS,
        logs: expect.arrayContaining([
          expect.stringContaining('"type":"log"'),
          expect.stringContaining('"type":"prompt_meta"'),
          expect.stringContaining('"type":"prompt_telemetry"'),
        ]),
      })
    );
  });

  it('marks run as FAILED when orchestration throws', async () => {
    const {
      service,
      dataMartService,
      dataMartRunService,
      aiAssistantSessionService,
      agentFlowService,
      systemTimeService,
    } = createService();

    dataMartService.getByIdAndProjectId.mockResolvedValue(dataMart);
    aiAssistantSessionService.getSessionByIdAndDataMartIdAndProjectId.mockResolvedValue(session);
    dataMartRunService.createAndMarkAiSourceRunAsPending.mockResolvedValue(run);
    dataMartRunService.markAiSourceRunAsStarted.mockResolvedValue({
      ...run,
      status: DataMartRunStatus.RUNNING,
    });
    aiAssistantSessionService.listMessagesBySessionIdAndDataMartIdAndProjectId.mockResolvedValue([
      userMessage,
    ]);
    agentFlowService.run.mockRejectedValue(new Error('orchestrator failed'));
    systemTimeService.now.mockReturnValue(now);

    await expect(service.run(command)).rejects.toThrow('orchestrator failed');

    expect(dataMartRunService.markAiSourceRunAsFinished).toHaveBeenCalledWith(
      run,
      expect.objectContaining({
        status: DataMartRunStatus.FAILED,
        errors: expect.arrayContaining([expect.stringContaining('orchestrator failed')]),
      })
    );
  });
});
