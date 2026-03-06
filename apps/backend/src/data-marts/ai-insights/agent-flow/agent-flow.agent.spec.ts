jest.mock('../../../common/ai-insights/llm-tool-runner', () => ({
  runAgentLoop: jest.fn(),
}));

jest.mock('../../../common/ai-insights/agent/tool-registry', () => ({
  ToolRegistry: class ToolRegistryMock {
    register = jest.fn();

    findToolByNames = jest.fn((names: string[]) =>
      names.map(name => ({
        name,
        inputJsonSchema: {},
        inputZod: { parse: (value: unknown) => value },
        execute: async () => ({}),
        isFinal: false,
      }))
    );
  },
}));

jest.mock('./agent-flow-tools.registrar', () => ({
  AgentFlowToolsRegistrar: function AgentFlowToolsRegistrarMock() {},
  AgentFlowTools: {
    LIST_TEMPLATE_SOURCES: 'source_list_template_sources',
    GET_TEMPLATE_CONTENT: 'source_get_template_content',
    PROPOSE_REMOVE_SOURCE: 'source_propose_remove_source',
    GENERATE_SQL: 'source_generate_sql',
    LIST_AVAILABLE_TAGS: 'source_list_available_tags',
  },
}));

jest.mock('./agent-flow-policy-sanitizer.service', () => {
  class AgentFlowContentPolicyRestrictedError extends Error {
    constructor(public readonly sanitizedLastUserMessage: string | null) {
      super('Blocked by AI content filter.');
    }
  }

  return {
    AgentFlowPolicySanitizerService: function AgentFlowPolicySanitizerServiceMock() {},
    AgentFlowContentPolicyRestrictedError,
  };
});

import { AiRole } from '../../../common/ai-insights/agent/ai-core';
import { runAgentLoop } from '../../../common/ai-insights/llm-tool-runner';
import { AiContentFilterError } from '../../../common/ai-insights/services/error';
import { createTelemetry } from './agent-telemetry.utils';
import { AiAssistantMessageRole } from '../../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../../enums/ai-assistant-scope.enum';
import { AgentFlowAgent } from './agent-flow.agent';
import { AgentFlowContentPolicyRestrictedError } from './agent-flow-policy-sanitizer.service';
import { AgentFlowPromptContext } from './types';
import type {
  AgentFlowValidationRetryEvaluationResult,
  AgentFlowValidationRetryRule,
} from './agent-flow-validation-retry.types';

describe('AgentFlowAgent', () => {
  const runAgentLoopMock = runAgentLoop as jest.Mock;

  const createRequest = (userText: string) => ({
    projectId: 'project-1',
    dataMartId: 'data-mart-1',
    conversationContext: {
      turns: [
        {
          role: AiAssistantMessageRole.USER,
          content: userText,
          createdAt: '2026-02-21T10:00:00.000Z',
        },
      ],
      conversationSnapshot: null,
    },
    sessionContext: {
      sessionId: 'session-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
    },
  });

  const createPromptContext = (userText: string): AgentFlowPromptContext => ({
    conversationContext: {
      turns: [
        {
          role: AiAssistantMessageRole.USER,
          content: userText,
          createdAt: '2026-02-21T10:00:00.000Z',
        },
      ],
      conversationSnapshot: null,
    },
    stateSnapshot: {
      sessionId: 'session-1',
      templateId: 'template-1',
      sources: [],
      appliedActions: [],
      pendingActions: [],
      sqlRevisions: [],
    },
  });

  const createAgent = () => {
    const toolsRegistrar = { registerTools: jest.fn() };
    const promptBuilder = {
      buildInitialMessages: jest.fn().mockImplementation(() => [
        { role: AiRole.SYSTEM, content: 'system prompt' },
        { role: AiRole.USER, content: 'user prompt' },
      ]),
    };
    const policySanitizer = {
      sanitizeLastUserMessageForRetry: jest.fn(),
    };
    const rules: AgentFlowValidationRetryRule[] = [
      {
        key: 'dummy',
        maxRetries: 2,
        retryLogMessage: 'Dummy rule retry',
        validate: () => ({ ok: true }),
        buildRetryHint: () => 'dummy feedback',
        toTerminalError: () => new Error('dummy'),
      },
    ];
    const validationRetryRules = {
      getRules: jest.fn().mockReturnValue(rules),
    };
    const validationRetryEngine = {
      evaluate: jest
        .fn()
        .mockReturnValue({ type: 'pass' } satisfies AgentFlowValidationRetryEvaluationResult),
    };

    const agent = new AgentFlowAgent(
      {} as never,
      toolsRegistrar as never,
      promptBuilder as never,
      policySanitizer as never,
      validationRetryRules as never,
      validationRetryEngine as never
    );

    return {
      agent,
      toolsRegistrar,
      promptBuilder,
      policySanitizer,
      validationRetryRules,
      validationRetryEngine,
      rules,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns result on first attempt without sanitizer retry', async () => {
    const { agent, promptBuilder, policySanitizer, validationRetryEngine } = createAgent();
    const request = createRequest('build SQL');
    const promptContext = createPromptContext('build SQL');
    const telemetry = createTelemetry();

    runAgentLoopMock.mockResolvedValue({
      result: {
        decision: 'explain',
        explanation: 'done',
        reasonDescription: 'Answered greeting/status directly.',
      },
      messages: [],
      toolExecutions: [],
    });

    const output = await agent.run(request as never, telemetry, promptContext);

    expect(output.result).toEqual({
      decision: 'explain',
      explanation: 'done',
      reasonDescription: 'Answered greeting/status directly.',
    });
    expect(policySanitizer.sanitizeLastUserMessageForRetry).not.toHaveBeenCalled();
    expect(runAgentLoopMock).toHaveBeenCalledTimes(1);
    expect(promptBuilder.buildInitialMessages).toHaveBeenCalledWith({
      request,
      promptContext,
    });
    expect(validationRetryEngine.evaluate).toHaveBeenCalledTimes(1);
    expect(output.context.request).toEqual(request);
  });

  it('retries once with sanitized message after policy error', async () => {
    const { agent, promptBuilder, policySanitizer, validationRetryEngine } = createAgent();
    const request = createRequest('unsafe SQL request');
    const promptContext = createPromptContext('unsafe SQL request');
    const telemetry = createTelemetry();

    const sanitizedRequest = createRequest('safe SQL request');
    const sanitizedPromptContext = createPromptContext('safe SQL request');

    runAgentLoopMock
      .mockRejectedValueOnce(new AiContentFilterError('openai'))
      .mockResolvedValueOnce({
        result: {
          decision: 'explain',
          explanation: 'ok after retry',
          reasonDescription: 'Second attempt succeeded after prompt sanitization.',
        },
        messages: [],
        toolExecutions: [],
      });
    policySanitizer.sanitizeLastUserMessageForRetry.mockResolvedValue({
      type: 'retry',
      request: sanitizedRequest,
      promptContext: sanitizedPromptContext,
      sanitizedLastUserMessage: 'safe SQL request',
    });

    const output = await agent.run(request as never, telemetry, promptContext);

    expect(policySanitizer.sanitizeLastUserMessageForRetry).toHaveBeenCalledWith({
      request,
      promptContext,
      telemetry,
    });
    expect(runAgentLoopMock).toHaveBeenCalledTimes(2);
    expect(promptBuilder.buildInitialMessages).toHaveBeenNthCalledWith(1, {
      request,
      promptContext,
    });
    expect(promptBuilder.buildInitialMessages).toHaveBeenNthCalledWith(2, {
      request: sanitizedRequest,
      promptContext: sanitizedPromptContext,
    });
    expect(validationRetryEngine.evaluate).toHaveBeenCalledTimes(1);
    expect(output.context.request).toEqual(sanitizedRequest);
    expect(output.context.sanitizedLastUserMessage).toBe('safe SQL request');
    expect(output.result).toEqual({
      decision: 'explain',
      explanation: 'ok after retry',
      reasonDescription: 'Second attempt succeeded after prompt sanitization.',
    });
  });

  it('throws restricted error when retry also fails with policy error', async () => {
    const { agent, policySanitizer, validationRetryEngine } = createAgent();
    const request = createRequest('unsafe SQL request');
    const promptContext = createPromptContext('unsafe SQL request');
    const telemetry = createTelemetry();

    runAgentLoopMock
      .mockRejectedValueOnce(new AiContentFilterError('openai'))
      .mockRejectedValueOnce(new AiContentFilterError('openai'));
    policySanitizer.sanitizeLastUserMessageForRetry.mockResolvedValue({
      type: 'retry',
      request: createRequest('safe SQL request'),
      promptContext: createPromptContext('safe SQL request'),
      sanitizedLastUserMessage: 'safe SQL request',
    });

    let thrown: unknown;
    try {
      await agent.run(request as never, telemetry, promptContext);
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AgentFlowContentPolicyRestrictedError);
    expect(thrown).toMatchObject({
      sanitizedLastUserMessage: 'safe SQL request',
    });
    expect(validationRetryEngine.evaluate).not.toHaveBeenCalled();
  });

  it('retries when validation engine asks for retry and succeeds on second response', async () => {
    const { agent, validationRetryEngine } = createAgent();
    const request = createRequest('edit template');
    const promptContext = createPromptContext('edit template');
    const telemetry = createTelemetry();

    runAgentLoopMock
      .mockResolvedValueOnce({
        result: {
          decision: 'edit_template',
          explanation: 'first',
          reasonDescription: 'first',
          templateEditIntent: {
            type: 'replace_template_document',
            text: '# Report\n\n[[TAG:t1]]',
            tags: [],
          },
        },
        messages: [],
        toolExecutions: [],
      })
      .mockResolvedValueOnce({
        result: {
          decision: 'edit_template',
          explanation: 'second',
          reasonDescription: 'second',
          templateEditIntent: {
            type: 'replace_template_document',
            text: '# Report\n\n[[TAG:t1]]',
            tags: [{ id: 't1', name: 'table', params: { source: 'main' } }],
          },
        },
        messages: [],
        toolExecutions: [],
      });
    validationRetryEngine.evaluate
      .mockReturnValueOnce({
        type: 'retry',
        ruleKey: 'template_edit_intent',
        retry: 1,
        feedback: 'Your previous response had an invalid templateEditIntent.',
        logMessage: 'template invalid',
        logMeta: { code: 'template_placeholder_unknown_id' },
      } satisfies AgentFlowValidationRetryEvaluationResult)
      .mockReturnValueOnce({ type: 'pass' } satisfies AgentFlowValidationRetryEvaluationResult);

    const output = await agent.run(request as never, telemetry, promptContext);

    expect(runAgentLoopMock).toHaveBeenCalledTimes(2);
    const secondCallArgs = runAgentLoopMock.mock.calls[1][0];
    expect(secondCallArgs.initialMessages.at(-1)).toEqual({
      role: AiRole.SYSTEM,
      content: 'Your previous response had an invalid templateEditIntent.',
    });
    expect(output.result.explanation).toBe('second');
  });

  it('throws terminal validation error from retry engine', async () => {
    const { agent, validationRetryEngine } = createAgent();
    const request = createRequest('edit template');
    const promptContext = createPromptContext('edit template');
    const telemetry = createTelemetry();

    runAgentLoopMock.mockResolvedValue({
      result: {
        decision: 'edit_template',
        explanation: 'invalid',
        reasonDescription: 'invalid',
        templateEditIntent: {
          type: 'replace_template_document',
          text: '# Report\n\n[[TAG:t1]]',
          tags: [],
        },
      },
      messages: [],
      toolExecutions: [],
    });
    validationRetryEngine.evaluate.mockImplementation(() => {
      throw new Error('template_edit_intent_invalid_after_2_retries');
    });

    await expect(agent.run(request as never, telemetry, promptContext)).rejects.toThrow(
      'template_edit_intent_invalid_after_2_retries'
    );
    expect(runAgentLoopMock).toHaveBeenCalledTimes(1);
  });

  it('uses isolated context per validation retry attempt', async () => {
    const { agent, validationRetryEngine } = createAgent();
    const request = createRequest('edit template');
    const promptContext = createPromptContext('edit template');
    const telemetry = createTelemetry();

    runAgentLoopMock
      .mockImplementationOnce(async ({ context }) => {
        context.lastGeneratedSql = 'SELECT 1';

        return {
          result: {
            decision: 'edit_template',
            explanation: 'first',
            reasonDescription: 'first',
            templateEditIntent: {
              type: 'replace_template_document',
              text: '# Report\n\n[[TAG:t1]]',
              tags: [],
            },
          },
          messages: [],
          toolExecutions: [],
        };
      })
      .mockResolvedValueOnce({
        result: {
          decision: 'edit_template',
          explanation: 'second',
          reasonDescription: 'second',
          templateEditIntent: {
            type: 'replace_template_document',
            text: '# Report\n\n[[TAG:t1]]',
            tags: [{ id: 't1', name: 'table', params: { source: 'main' } }],
          },
        },
        messages: [],
        toolExecutions: [],
      });
    validationRetryEngine.evaluate
      .mockReturnValueOnce({
        type: 'retry',
        ruleKey: 'template_edit_intent',
        retry: 1,
        feedback: 'retry feedback',
        logMessage: 'invalid',
        logMeta: {},
      } satisfies AgentFlowValidationRetryEvaluationResult)
      .mockReturnValueOnce({ type: 'pass' } satisfies AgentFlowValidationRetryEvaluationResult);

    const output = await agent.run(request as never, telemetry, promptContext);

    expect(runAgentLoopMock).toHaveBeenCalledTimes(2);

    const firstContext = runAgentLoopMock.mock.calls[0][0].context;
    const secondContext = runAgentLoopMock.mock.calls[1][0].context;
    expect(firstContext).not.toBe(secondContext);
    expect(firstContext.lastGeneratedSql).toBe('SELECT 1');
    expect(secondContext.lastGeneratedSql).toBeUndefined();

    expect(output.context).toBe(secondContext);
    expect(output.context.lastGeneratedSql).toBeUndefined();
  });

  it('resets retry feedback and state after content policy recovery', async () => {
    const { agent, policySanitizer, validationRetryEngine } = createAgent();
    const request = createRequest('unsafe SQL request');
    const promptContext = createPromptContext('unsafe SQL request');
    const telemetry = createTelemetry();
    const sanitizedRequest = createRequest('safe SQL request');
    const sanitizedPromptContext = createPromptContext('safe SQL request');

    runAgentLoopMock
      .mockResolvedValueOnce({
        result: {
          decision: 'edit_template',
          explanation: 'first',
          reasonDescription: 'first',
          templateEditIntent: {
            type: 'replace_template_document',
            text: '# Report\n\n[[TAG:t1]]',
            tags: [],
          },
        },
        messages: [],
        toolExecutions: [],
      })
      .mockRejectedValueOnce(new AiContentFilterError('openai'))
      .mockResolvedValueOnce({
        result: {
          decision: 'explain',
          explanation: 'ok after sanitize',
          reasonDescription: 'ok',
        },
        messages: [],
        toolExecutions: [],
      });
    validationRetryEngine.evaluate
      .mockReturnValueOnce({
        type: 'retry',
        ruleKey: 'template_edit_intent',
        retry: 1,
        feedback: 'retry feedback',
        logMessage: 'invalid',
        logMeta: {},
      } satisfies AgentFlowValidationRetryEvaluationResult)
      .mockReturnValueOnce({ type: 'pass' } satisfies AgentFlowValidationRetryEvaluationResult);
    policySanitizer.sanitizeLastUserMessageForRetry.mockResolvedValue({
      type: 'retry',
      request: sanitizedRequest,
      promptContext: sanitizedPromptContext,
      sanitizedLastUserMessage: 'safe SQL request',
    });

    const output = await agent.run(request as never, telemetry, promptContext);

    expect(runAgentLoopMock).toHaveBeenCalledTimes(3);
    expect(runAgentLoopMock.mock.calls[1][0].initialMessages.at(-1)).toEqual({
      role: AiRole.SYSTEM,
      content: 'retry feedback',
    });
    expect(runAgentLoopMock.mock.calls[2][0].initialMessages.at(-1)).toEqual({
      role: AiRole.USER,
      content: 'user prompt',
    });

    const firstState = validationRetryEngine.evaluate.mock.calls[0][0].state;
    const secondState = validationRetryEngine.evaluate.mock.calls[1][0].state;
    expect(firstState).not.toBe(secondState);

    expect(output.context.request).toEqual(sanitizedRequest);
  });
});
