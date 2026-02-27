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
    const baseSqlHandleResolverService = {
      resolve: jest.fn(),
    };

    return {
      service: new GenerateSqlTool(
        orchestrator as never,
        new AgentFlowRequestMapper(),
        baseSqlHandleResolverService as never
      ),
      orchestrator,
      baseSqlHandleResolverService,
    };
  };

  it('uses rev baseSqlHandle to resolve base SQL for refine mode', async () => {
    const { service, orchestrator, baseSqlHandleResolverService } = createService();
    const context = createContext();

    baseSqlHandleResolverService.resolve.mockResolvedValue({
      baseSql: 'SELECT 42',
      baseAssistantMessageId: 'assistant-message-42',
      origin: { type: 'handle', handle: 'rev:assistant-message-42', kind: 'rev' },
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
        baseSqlHandle: 'rev:assistant-message-42',
        refineInstructions: 'add alias',
      },
      context
    );

    expect(baseSqlHandleResolverService.resolve).toHaveBeenCalledWith(
      'rev:assistant-message-42',
      context.request
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
    const { service, baseSqlHandleResolverService } = createService();
    const context = createContext();

    baseSqlHandleResolverService.resolve.mockRejectedValue(
      new Error('Unable to resolve SQL for baseSqlHandle "rev:missing-message"')
    );

    await expect(
      service.execute(
        {
          mode: 'refine',
          baseSqlHandle: 'rev:missing-message',
          refineInstructions: 'change metric',
        },
        context
      )
    ).rejects.toThrow('Unable to resolve SQL for baseSqlHandle');
  });

  it('fails refine mode when base revision has empty sqlCandidate', async () => {
    const { service, baseSqlHandleResolverService } = createService();
    const context = createContext();

    baseSqlHandleResolverService.resolve.mockRejectedValue(
      new Error('Unable to resolve SQL for baseSqlHandle "rev:assistant-message-1"')
    );

    await expect(
      service.execute(
        {
          mode: 'refine',
          baseSqlHandle: 'rev:assistant-message-1',
          refineInstructions: 'change metric',
        },
        context
      )
    ).rejects.toThrow('Unable to resolve SQL for baseSqlHandle');
  });

  it('ignores unknown refine fields in schema (zod strips unknown keys)', () => {
    const parsed = GenerateSqlInputSchema.parse({
      mode: 'refine',
      baseSqlHandle: 'rev:assistant-message-1',
      refineInstructions: 'change metric',
      refineSql: 'SELECT * FROM table',
    });

    expect(parsed).toEqual({
      mode: 'refine',
      baseSqlHandle: 'rev:assistant-message-1',
      refineInstructions: 'change metric',
    });
  });

  it('uses src baseSqlHandle to resolve SQL from template source', async () => {
    const { service, orchestrator, baseSqlHandleResolverService } = createService();
    const context = createContext();

    baseSqlHandleResolverService.resolve.mockResolvedValue({
      baseSql: 'SELECT * FROM artifact_source',
      origin: {
        type: 'handle',
        handle: 'src:0e12a5d0-865e-4d1a-95d9-bf67a127f2c8',
        kind: 'src',
      },
    });
    orchestrator.run.mockResolvedValue({
      status: 'ok',
      decision: 'refine_existing_sql',
      result: {
        sqlCandidate: 'SELECT * FROM artifact_source WHERE country = "US"',
        dryRun: {
          isValid: true,
        },
      },
    });

    await service.execute(
      {
        mode: 'refine',
        baseSqlHandle: 'src:0e12a5d0-865e-4d1a-95d9-bf67a127f2c8',
        refineInstructions: 'filter to US',
      },
      context
    );

    expect(baseSqlHandleResolverService.resolve).toHaveBeenCalledWith(
      'src:0e12a5d0-865e-4d1a-95d9-bf67a127f2c8',
      context.request
    );
    expect(orchestrator.run).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionContext: expect.objectContaining({
          currentArtifactSql: 'SELECT * FROM artifact_source',
        }),
      }),
      'refine'
    );
  });

  it('uses art baseSqlHandle to resolve SQL from artifact', async () => {
    const { service, orchestrator, baseSqlHandleResolverService } = createService();
    const context = createContext();

    baseSqlHandleResolverService.resolve.mockResolvedValue({
      baseSql: 'SELECT * FROM raw_artifact',
      origin: { type: 'handle', handle: 'art:artifact-42', kind: 'art' },
    });
    orchestrator.run.mockResolvedValue({
      status: 'ok',
      decision: 'refine_existing_sql',
      result: {
        sqlCandidate: 'SELECT * FROM raw_artifact LIMIT 10',
        dryRun: {
          isValid: true,
        },
      },
    });

    await service.execute(
      {
        mode: 'refine',
        baseSqlHandle: 'art:artifact-42',
        refineInstructions: 'limit to 10 rows',
      },
      context
    );

    expect(baseSqlHandleResolverService.resolve).toHaveBeenCalledWith(
      'art:artifact-42',
      context.request
    );
    expect(orchestrator.run).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionContext: expect.objectContaining({
          currentArtifactSql: 'SELECT * FROM raw_artifact',
        }),
      }),
      'refine'
    );
  });

  it('uses baseSqlText as refine fallback when no persisted handle exists', async () => {
    const { service, orchestrator, baseSqlHandleResolverService } = createService();
    const context = createContext();

    orchestrator.run.mockResolvedValue({
      status: 'ok',
      decision: 'refine_existing_sql',
      result: {
        sqlCandidate: 'SELECT 1 AS value',
        dryRun: { isValid: true },
      },
    });

    await service.execute(
      {
        mode: 'refine',
        baseSqlText: 'SELECT 1',
        refineInstructions: 'add alias',
      },
      context
    );

    expect(baseSqlHandleResolverService.resolve).not.toHaveBeenCalled();
    expect(orchestrator.run).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionContext: expect.objectContaining({
          currentArtifactSql: 'SELECT 1',
        }),
      }),
      'refine'
    );
  });

  it('prefers baseSqlHandle when baseSqlHandle and baseSqlText are both provided', async () => {
    const { service, orchestrator, baseSqlHandleResolverService } = createService();
    const context = createContext();

    baseSqlHandleResolverService.resolve.mockResolvedValue({
      baseSql: 'SELECT 42',
      baseAssistantMessageId: 'assistant-message-1',
      origin: { type: 'handle', handle: 'rev:assistant-message-1', kind: 'rev' },
    });
    orchestrator.run.mockResolvedValue({
      status: 'ok',
      decision: 'refine_existing_sql',
      result: {
        sqlCandidate: 'SELECT 42 AS value',
        dryRun: { isValid: true },
      },
    });

    await service.execute(
      {
        mode: 'refine',
        baseSqlHandle: 'rev:assistant-message-1',
        baseSqlText: 'SELECT 1',
        refineInstructions: 'change metric',
      },
      context
    );

    expect(baseSqlHandleResolverService.resolve).toHaveBeenCalledWith(
      'rev:assistant-message-1',
      context.request
    );
  });

  it('runs create mode without sql revision lookup', async () => {
    const { service, orchestrator, baseSqlHandleResolverService } = createService();
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

    expect(baseSqlHandleResolverService.resolve).not.toHaveBeenCalled();
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
