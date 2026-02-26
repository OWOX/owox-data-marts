jest.mock('../ai-assistant-orchestrator.service', () => ({
  AiSourceOrchestratorService: function AiSourceOrchestratorServiceMock() {},
}));

import { AiAssistantMessageRole } from '../../../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../../../enums/ai-assistant-scope.enum';
import { AgentFlowRequestMapper } from '../../../mappers/agent-flow-request.mapper';
import { AgentFlowContext } from '../types';
import { GenerateSqlInputSchema, GenerateSqlTool } from './generate-sql.tool';

describe('GenerateSqlTool', () => {
  const createContext = (): AgentFlowContext => ({
    telemetry: {
      llmCalls: [],
      toolCalls: [],
      messageHistory: [],
    },
    request: {
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
      history: [
        {
          role: AiAssistantMessageRole.USER,
          content: 'original user message',
          createdAt: '2026-02-21T10:00:00.000Z',
        },
      ],
      sessionContext: {
        sessionId: 'session-1',
        scope: AiAssistantScope.TEMPLATE,
        templateId: 'template-1',
      },
    },
    collectedProposedActions: [],
  });

  const createService = () => {
    const orchestrator = {
      run: jest.fn(),
    };
    const aiAssistantSessionService = {
      getAssistantMessageByIdAndSessionId: jest.fn(),
    };

    return {
      service: new GenerateSqlTool(
        orchestrator as never,
        aiAssistantSessionService as never,
        new AgentFlowRequestMapper()
      ),
      orchestrator,
      aiAssistantSessionService,
    };
  };

  it('uses sqlRevisionId to resolve base SQL for refine mode', async () => {
    const { service, orchestrator, aiAssistantSessionService } = createService();
    const context = createContext();

    aiAssistantSessionService.getAssistantMessageByIdAndSessionId.mockResolvedValue({
      id: 'assistant-message-42',
      sqlCandidate: 'SELECT 42',
    });
    orchestrator.run.mockResolvedValue({
      status: 'ok',
      decision: 'refine_existing_sql',
      result: {
        sqlCandidate: 'SELECT 42 AS refined',
        dryRun: {
          isValid: true,
        },
        repairAttempts: 1,
      },
    });

    const result = await service.execute(
      {
        mode: 'refine',
        sqlRevisionId: 'assistant-message-42',
        refineInstructions: 'add alias',
      },
      context
    );

    expect(aiAssistantSessionService.getAssistantMessageByIdAndSessionId).toHaveBeenCalledWith(
      'assistant-message-42',
      'session-1'
    );
    expect(orchestrator.run).toHaveBeenCalledWith(
      expect.objectContaining({
        history: [
          expect.objectContaining({
            role: AiAssistantMessageRole.USER,
            content: 'add alias',
          }),
        ],
        sessionContext: expect.objectContaining({
          currentArtifactSql: 'SELECT 42',
        }),
      }),
      'refine'
    );
    expect(result).toEqual({
      sqlCandidate: 'SELECT 42 AS refined',
      dryRunValid: true,
      dryRunError: null,
      repairAttempts: 1,
    });
    expect(context.lastGeneratedSql).toBe('SELECT 42 AS refined');
    expect(context.lastDryRunValid).toBe(true);
  });

  it('propagates reasonDescription, diagnostics and merges nested telemetry', async () => {
    const { service, orchestrator } = createService();
    const context = createContext();

    orchestrator.run.mockResolvedValue({
      status: 'ok',
      decision: 'create_new_source_sql',
      result: {
        sqlCandidate: 'SELECT 1',
        dryRun: {
          isValid: true,
        },
        repairAttempts: 0,
      },
      meta: {
        reasonDescription: 'SQL built successfully',
        diagnostics: {
          warnings: ['uses sampled rows'],
        },
        telemetry: {
          llmCalls: [
            {
              turn: 0,
              model: 'gpt-test',
              finishReason: 'stop',
              usage: {
                promptTokens: 10,
                completionTokens: 5,
                totalTokens: 15,
                executionTime: 0,
                reasoningTokens: 0,
              },
            },
          ],
          toolCalls: [],
          messageHistory: [],
        },
      },
    });

    const result = await service.execute({ mode: 'create' }, context);

    expect(result).toEqual({
      sqlCandidate: 'SELECT 1',
      dryRunValid: true,
      dryRunError: null,
      repairAttempts: 0,
      reasonDescription: 'SQL built successfully',
      diagnostics: {
        warnings: ['uses sampled rows'],
      },
    });
    expect(context.lastGeneratedSqlReasonDescription).toBe('SQL built successfully');
    expect(context.lastGeneratedSqlDiagnostics).toEqual({
      warnings: ['uses sampled rows'],
    });
    expect(context.telemetry?.llmCalls).toHaveLength(1);
  });

  it('fails refine mode when sql revision is unknown', async () => {
    const { service, aiAssistantSessionService } = createService();
    const context = createContext();

    aiAssistantSessionService.getAssistantMessageByIdAndSessionId.mockRejectedValue(
      new Error('not found')
    );

    await expect(
      service.execute(
        {
          mode: 'refine',
          sqlRevisionId: 'missing-message',
          refineInstructions: 'change metric',
        },
        context
      )
    ).rejects.toThrow('not found');
  });

  it('fails refine mode when base revision has empty sqlCandidate', async () => {
    const { service, aiAssistantSessionService } = createService();
    const context = createContext();

    aiAssistantSessionService.getAssistantMessageByIdAndSessionId.mockResolvedValue({
      id: 'assistant-message-1',
      sqlCandidate: '   ',
    });

    await expect(
      service.execute(
        {
          mode: 'refine',
          sqlRevisionId: 'assistant-message-1',
          refineInstructions: 'change metric',
        },
        context
      )
    ).rejects.toThrow('empty sqlCandidate');
  });

  it('ignores legacy refineSql field in schema (zod strips unknown keys)', () => {
    const parsed = GenerateSqlInputSchema.parse({
      mode: 'refine',
      sqlRevisionId: 'assistant-message-1',
      refineInstructions: 'change metric',
      refineSql: 'SELECT * FROM table',
    });

    expect(parsed).toEqual({
      mode: 'refine',
      sqlRevisionId: 'assistant-message-1',
      refineInstructions: 'change metric',
    });
  });

  it('runs create mode without sql revision lookup', async () => {
    const { service, orchestrator, aiAssistantSessionService } = createService();
    const context = createContext();

    orchestrator.run.mockResolvedValue({
      status: 'ok',
      decision: 'create_new_source_sql',
      result: {
        sqlCandidate: 'SELECT 1',
        dryRun: {
          isValid: true,
        },
      },
    });

    const result = await service.execute({ mode: 'create' }, context);

    expect(aiAssistantSessionService.getAssistantMessageByIdAndSessionId).not.toHaveBeenCalled();
    expect(orchestrator.run).toHaveBeenCalledWith(context.request, 'create');
    expect(result).toEqual({
      sqlCandidate: 'SELECT 1',
      dryRunValid: true,
      dryRunError: null,
      repairAttempts: 0,
    });
  });

  it('uses taskPrompt in create mode to scope SQL generation to one subtask', async () => {
    const { service, orchestrator } = createService();
    const context = createContext();

    orchestrator.run.mockResolvedValue({
      status: 'ok',
      decision: 'create_new_source_sql',
      result: {
        sqlCandidate: 'SELECT 2025 AS year',
        dryRun: {
          isValid: true,
        },
      },
    });

    await service.execute(
      {
        mode: 'create',
        taskPrompt: 'What is total consumption in 2025? Monthly breakdown as table.',
      },
      context
    );

    expect(orchestrator.run).toHaveBeenCalledWith(
      expect.objectContaining({
        history: [
          expect.objectContaining({
            role: AiAssistantMessageRole.USER,
            content: 'What is total consumption in 2025? Monthly breakdown as table.',
          }),
        ],
      }),
      'create'
    );
  });
});
