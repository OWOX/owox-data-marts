jest.mock('../ai-insights/agent-flow/agent-flow.service');
jest.mock('@owox/internal-helpers', () => {
  const actual = jest.requireActual('@owox/internal-helpers');

  return {
    ...actual,
    formatDuration: (value: number) => `${value}ms`,
    castError: (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
  };
});

import { RunType } from '../../common/scheduler/shared/types';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../enums/ai-assistant-scope.enum';
import { AiAssistantTurnProcessedEvent } from '../events/ai-assistant-turn-processed.event';
import { AiAssistantTurnProcessedEventMapper } from '../mappers/ai-assistant-turn-processed-event.mapper';
import { RunAiAssistantCommand, RunAiAssistantService } from './run-ai-assistant.service';

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
    meta: null,
    createdAt: new Date('2026-02-15T11:59:50.000Z'),
  };

  const assistantMessage = {
    id: 'assistant-message-1',
    role: AiAssistantMessageRole.ASSISTANT,
    content: 'SQL candidate is ready.',
    createdAt: new Date('2026-02-15T12:00:10.000Z'),
  };

  const promptContext = {
    conversationContext: {
      turns: [
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
    const aiAssistantTurnProcessedEventMapper = new AiAssistantTurnProcessedEventMapper();
    const eventDispatcher = {
      publishExternal: jest.fn().mockResolvedValue(undefined),
      publishExternalSafely: jest.fn(),
    };
    const systemTimeService = {
      now: jest.fn(),
    };
    const clsContextService = {
      runWithContext: jest.fn((_key, _context, callback: () => unknown) => callback()),
      update: jest.fn(),
    };

    const service = new RunAiAssistantService(
      dataMartService as never,
      dataMartRunService as never,
      aiAssistantSessionService as never,
      agentFlowService as never,
      agentFlowContextManager as never,
      aiAssistantTurnProcessedEventMapper as never,
      eventDispatcher as never,
      systemTimeService as never,
      clsContextService as never
    );

    return {
      service,
      dataMartService,
      dataMartRunService,
      aiAssistantSessionService,
      agentFlowService,
      agentFlowContextManager,
      aiAssistantTurnProcessedEventMapper,
      eventDispatcher,
      systemTimeService,
      clsContextService,
    };
  };

  it('creates run, completes SUCCESS and emits turn_processed event', async () => {
    const {
      service,
      dataMartService,
      dataMartRunService,
      aiAssistantSessionService,
      agentFlowService,
      eventDispatcher,
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
      proposedActions: [
        {
          id: 'request-1',
          type: 'create_source_and_attach',
          confidence: 0.91,
          payload: {
            suggestedSourceKey: 'purchases',
          },
        },
      ],
      resolvedContext: {
        targetSourceKey: 'purchases',
        targetKind: 'TABLE',
        contextResolution: 'inferred_key',
      },
      explanation: 'SQL candidate is ready.',
      meta: {
        sanitizedLastUserMessage: 'Generate source for purchases',
        reasonDescription: 'Ready',
        telemetry: {
          llmCalls: [
            {
              turn: 1,
              model: 'gpt-5-mini',
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
          toolCalls: [
            {
              turn: 1,
              name: 'generate_sql',
              argsJson: '{}',
              success: true,
            },
          ],
          messageHistory: [],
        },
      },
    });
    aiAssistantSessionService.addMessage.mockResolvedValue(assistantMessage);
    systemTimeService.now.mockReturnValue(now);

    const result = await service.run(command);

    expect(result.runId).toBe('run-1');
    expect(result.assistantMessageId).toBe('assistant-message-1');
    expect(agentFlowService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          maxRows: 101,
        },
      }),
      promptContext
    );

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

    expect(eventDispatcher.publishExternalSafely).toHaveBeenCalledTimes(1);
    const [event] = eventDispatcher.publishExternalSafely.mock.calls[0];
    expect(event).toBeInstanceOf(AiAssistantTurnProcessedEvent);
    expect(event.name).toBe('ai_assistant.turn_processed');
    expect(event.payload).toEqual({
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
      userId: 'user-1',
      sessionId: 'session-1',
      templateId: 'template-1',
      runId: 'run-1',
      turnId: 'user-message-1',
      userMessageId: 'user-message-1',
      assistantMessageId: 'assistant-message-1',
      assistantStatus: 'ok',
      status: DataMartRunStatus.SUCCESS,
      decision: 'propose_action',
      reasonDescription: 'Ready',
      userMessage: 'Generate source for purchases',
      assistantMessage: 'SQL candidate is ready.',
      hasSqlCandidate: true,
      sql: 'select * from users',
      proposedActionTypes: ['create_source_and_attach'],
      proposedActionCount: 1,
      resolvedContext: {
        targetSourceKey: 'purchases',
        targetKind: 'TABLE',
      },
      meta: {
        reasonDescription: 'Ready',
        telemetryData: {
          llmCalls: [
            {
              turn: 1,
              model: 'gpt-5-mini',
              finishReason: 'stop',
              usage: {
                executionTime: 120,
                promptTokens: 100,
                completionTokens: 30,
                reasoningTokens: 0,
                totalTokens: 130,
              },
            },
          ],
          toolCalls: [
            {
              turn: 1,
              name: 'generate_sql',
              args: {},
              success: true,
            },
          ],
        },
        totalUsage: {
          executionTime: 120,
          calls: 1,
          promptTokens: 100,
          completionTokens: 30,
          reasoningTokens: 0,
          totalTokens: 130,
        },
        totalUsageByModel: [
          {
            model: 'gpt-5-mini',
            executionTime: 120,
            calls: 1,
            promptTokens: 100,
            completionTokens: 30,
            reasoningTokens: 0,
            totalTokens: 130,
          },
        ],
        llmCalls: 1,
        toolCalls: 1,
        failedToolCalls: 0,
        lastFinishReason: 'stop',
      },
    });
    expect(event.payload.meta.telemetryData).toEqual({
      llmCalls: [
        {
          turn: 1,
          model: 'gpt-5-mini',
          finishReason: 'stop',
          usage: {
            executionTime: 120,
            promptTokens: 100,
            completionTokens: 30,
            reasoningTokens: 0,
            totalTokens: 130,
          },
        },
      ],
      toolCalls: [
        {
          turn: 1,
          name: 'generate_sql',
          args: {},
          success: true,
        },
      ],
    });
  });

  it('emits processed event for handled assistant error turn', async () => {
    const {
      service,
      dataMartService,
      dataMartRunService,
      aiAssistantSessionService,
      agentFlowService,
      eventDispatcher,
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
      status: 'error',
      decision: 'clarify',
      explanation: 'Unable to process this request right now.',
      meta: {
        sanitizedLastUserMessage: null,
        reasonDescription: 'orchestrator degraded',
        telemetry: {
          llmCalls: [
            {
              turn: 1,
              model: 'gpt-5-mini',
              usage: {
                executionTime: 80,
                promptTokens: 40,
                completionTokens: 10,
                reasoningTokens: 2,
                totalTokens: 52,
              },
              finishReason: 'length',
            },
          ],
          toolCalls: [
            {
              turn: 1,
              name: 'generate_sql',
              argsJson: '{}',
              success: false,
              errorMessage: 'dry-run failed',
            },
          ],
          messageHistory: [],
        },
      },
    });
    aiAssistantSessionService.addMessage.mockResolvedValue({
      id: 'assistant-message-2',
      role: AiAssistantMessageRole.ASSISTANT,
      content: 'Unable to process this request right now.',
      createdAt: new Date('2026-02-15T12:00:12.000Z'),
    });
    systemTimeService.now.mockReturnValue(now);

    const result = await service.run(command);

    expect(result.runId).toBe('run-1');
    expect(result.assistantMessageId).toBe('assistant-message-2');
    expect(dataMartRunService.markAiSourceRunAsFinished).toHaveBeenCalledWith(
      run,
      expect.objectContaining({
        status: DataMartRunStatus.FAILED,
      })
    );

    expect(eventDispatcher.publishExternalSafely).toHaveBeenCalledTimes(1);
    const [event] = eventDispatcher.publishExternalSafely.mock.calls[0];
    expect(event).toBeInstanceOf(AiAssistantTurnProcessedEvent);
    expect(event.payload).toEqual({
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
      userId: 'user-1',
      sessionId: 'session-1',
      templateId: 'template-1',
      runId: 'run-1',
      turnId: 'user-message-1',
      userMessageId: 'user-message-1',
      assistantMessageId: 'assistant-message-2',
      assistantStatus: 'error',
      status: DataMartRunStatus.FAILED,
      decision: 'clarify',
      reasonDescription: 'orchestrator degraded',
      userMessage: 'Generate source for purchases',
      assistantMessage: 'Unable to process this request right now.',
      hasSqlCandidate: false,
      proposedActionTypes: [],
      proposedActionCount: 0,
      meta: {
        reasonDescription: 'orchestrator degraded',
        telemetryData: {
          llmCalls: [
            {
              turn: 1,
              model: 'gpt-5-mini',
              finishReason: 'length',
              usage: {
                executionTime: 80,
                promptTokens: 40,
                completionTokens: 10,
                reasoningTokens: 2,
                totalTokens: 52,
              },
            },
          ],
          toolCalls: [
            {
              turn: 1,
              name: 'generate_sql',
              args: {},
              success: false,
              errorMessage: 'dry-run failed',
            },
          ],
        },
        totalUsage: {
          executionTime: 80,
          calls: 1,
          promptTokens: 40,
          completionTokens: 10,
          reasoningTokens: 2,
          totalTokens: 52,
        },
        totalUsageByModel: [
          {
            model: 'gpt-5-mini',
            executionTime: 80,
            calls: 1,
            promptTokens: 40,
            completionTokens: 10,
            reasoningTokens: 2,
            totalTokens: 52,
          },
        ],
        llmCalls: 1,
        toolCalls: 1,
        failedToolCalls: 1,
        lastFinishReason: 'length',
      },
    });
    expect(event.payload.meta.telemetryData).toEqual({
      llmCalls: [
        {
          turn: 1,
          model: 'gpt-5-mini',
          finishReason: 'length',
          usage: {
            executionTime: 80,
            promptTokens: 40,
            completionTokens: 10,
            reasoningTokens: 2,
            totalTokens: 52,
          },
        },
      ],
      toolCalls: [
        {
          turn: 1,
          name: 'generate_sql',
          args: {},
          success: false,
          errorMessage: 'dry-run failed',
        },
      ],
    });
  });

  it('marks run as FAILED when orchestration throws and emits failed turn_processed event', async () => {
    const {
      service,
      dataMartService,
      dataMartRunService,
      aiAssistantSessionService,
      agentFlowService,
      eventDispatcher,
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
    expect(eventDispatcher.publishExternalSafely).toHaveBeenCalledTimes(1);
    const [event] = eventDispatcher.publishExternalSafely.mock.calls[0];
    expect(event).toBeInstanceOf(AiAssistantTurnProcessedEvent);
    expect(event.payload).toEqual({
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
      userId: 'user-1',
      sessionId: 'session-1',
      templateId: 'template-1',
      runId: 'run-1',
      turnId: 'user-message-1',
      userMessageId: 'user-message-1',
      assistantMessageId: null,
      assistantStatus: 'error',
      status: DataMartRunStatus.FAILED,
      decision: 'clarify',
      reasonDescription: 'orchestrator failed',
      error: 'orchestrator failed',
      userMessage: 'Generate source for purchases',
      assistantMessage: 'Unable to process request. Try again later.',
      hasSqlCandidate: false,
      proposedActionTypes: [],
      proposedActionCount: 0,
      meta: {
        reasonDescription: 'orchestrator failed',
        telemetryData: {
          llmCalls: [],
          toolCalls: [],
        },
        totalUsage: {
          executionTime: 0,
          calls: 0,
          promptTokens: 0,
          completionTokens: 0,
          reasoningTokens: 0,
          totalTokens: 0,
        },
        totalUsageByModel: [],
        llmCalls: 0,
        toolCalls: 0,
        failedToolCalls: 0,
        lastFinishReason: undefined,
      },
    });
    expect(event.payload.meta.telemetryData).toEqual({
      llmCalls: [],
      toolCalls: [],
    });
  });

  it('keeps SUCCESS run when turn_processed event publish fails', async () => {
    const {
      service,
      dataMartService,
      dataMartRunService,
      aiAssistantSessionService,
      agentFlowService,
      eventDispatcher,
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
      },
      proposedActions: [],
      explanation: 'SQL candidate is ready.',
      meta: {
        sanitizedLastUserMessage: 'Generate source for purchases',
        reasonDescription: 'Ready',
        telemetry: {
          llmCalls: [],
          toolCalls: [],
          messageHistory: [],
        },
      },
    });
    aiAssistantSessionService.addMessage.mockResolvedValue(assistantMessage);
    eventDispatcher.publishExternalSafely.mockImplementation(() => undefined);
    systemTimeService.now.mockReturnValue(now);

    await expect(service.run(command)).resolves.toMatchObject({
      runId: 'run-1',
      assistantMessageId: 'assistant-message-1',
    });

    expect(dataMartRunService.markAiSourceRunAsFinished).toHaveBeenCalledWith(
      run,
      expect.objectContaining({
        status: DataMartRunStatus.SUCCESS,
      })
    );
  });

  it('preserves original assistant error when failed turn_processed publish fails', async () => {
    const {
      service,
      dataMartService,
      dataMartRunService,
      aiAssistantSessionService,
      agentFlowService,
      eventDispatcher,
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
    eventDispatcher.publishExternalSafely.mockImplementation(() => undefined);
    systemTimeService.now.mockReturnValue(now);

    await expect(service.run(command)).rejects.toThrow('orchestrator failed');

    expect(dataMartRunService.markAiSourceRunAsFinished).toHaveBeenCalledWith(
      run,
      expect.objectContaining({
        status: DataMartRunStatus.FAILED,
      })
    );
  });

  it('fails before saving assistant message when proposedActions are invalid and emits failed turn_processed event', async () => {
    const {
      service,
      dataMartService,
      dataMartRunService,
      aiAssistantSessionService,
      agentFlowService,
      eventDispatcher,
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
      explanation: 'I prepared an action.',
      proposedActions: [
        {
          id: 'request-1',
          type: 'apply_changes_to_source',
          confidence: 0.9,
          payload: {},
        },
      ],
      meta: {
        sanitizedLastUserMessage: null,
        reasonDescription: 'Ready',
        telemetry: {
          llmCalls: [],
          toolCalls: [],
          messageHistory: [],
        },
      },
    });
    systemTimeService.now.mockReturnValue(now);

    await expect(service.run(command)).rejects.toThrow('sourceKey');

    expect(aiAssistantSessionService.addMessage).not.toHaveBeenCalled();
    expect(dataMartRunService.markAiSourceRunAsFinished).toHaveBeenCalledWith(
      run,
      expect.objectContaining({
        status: DataMartRunStatus.FAILED,
      })
    );
    expect(eventDispatcher.publishExternalSafely).toHaveBeenCalledTimes(1);
    const [event] = eventDispatcher.publishExternalSafely.mock.calls[0];
    expect(event).toBeInstanceOf(AiAssistantTurnProcessedEvent);
    expect(event.payload).toEqual({
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
      userId: 'user-1',
      sessionId: 'session-1',
      templateId: 'template-1',
      runId: 'run-1',
      turnId: 'user-message-1',
      userMessageId: 'user-message-1',
      assistantMessageId: null,
      assistantStatus: 'error',
      status: DataMartRunStatus.FAILED,
      decision: 'propose_action',
      reasonDescription:
        '[\n  {\n    "code": "custom",\n    "path": [\n      0,\n      "payload",\n      "sourceKey"\n    ],\n    "message": "Either payload.sourceKey or payload.sourceId must be provided"\n  }\n]',
      error:
        '[\n  {\n    "code": "custom",\n    "path": [\n      0,\n      "payload",\n      "sourceKey"\n    ],\n    "message": "Either payload.sourceKey or payload.sourceId must be provided"\n  }\n]',
      userMessage: 'Generate source for purchases',
      assistantMessage: 'I prepared an action.',
      hasSqlCandidate: false,
      proposedActionTypes: [],
      proposedActionCount: 0,
      meta: {
        reasonDescription:
          '[\n  {\n    "code": "custom",\n    "path": [\n      0,\n      "payload",\n      "sourceKey"\n    ],\n    "message": "Either payload.sourceKey or payload.sourceId must be provided"\n  }\n]',
        telemetryData: {
          llmCalls: [],
          toolCalls: [],
        },
        totalUsage: {
          executionTime: 0,
          calls: 0,
          promptTokens: 0,
          completionTokens: 0,
          reasoningTokens: 0,
          totalTokens: 0,
        },
        totalUsageByModel: [],
        llmCalls: 0,
        toolCalls: 0,
        failedToolCalls: 0,
        lastFinishReason: undefined,
      },
    });
    expect(event.payload.meta.telemetryData).toEqual({
      llmCalls: [],
      toolCalls: [],
    });
  });
});
