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
    LIST_ARTIFACTS: 'source_list_artifacts',
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

describe('AgentFlowAgent', () => {
  const runAgentLoopMock = runAgentLoop as jest.Mock;

  const createRequest = (userText: string) => ({
    projectId: 'project-1',
    dataMartId: 'data-mart-1',
    history: [
      {
        role: AiAssistantMessageRole.USER,
        content: userText,
        createdAt: '2026-02-21T10:00:00.000Z',
      },
    ],
    sessionContext: {
      sessionId: 'session-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
    },
  });

  const createPromptContext = (userText: string): AgentFlowPromptContext => ({
    recentTurns: [
      {
        role: AiAssistantMessageRole.USER,
        content: userText,
        createdAt: '2026-02-21T10:00:00.000Z',
      },
    ],
    conversationSnapshot: null,
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
      buildInitialMessages: jest.fn().mockReturnValue([
        { role: AiRole.SYSTEM, content: 'system prompt' },
        { role: AiRole.USER, content: 'user prompt' },
      ]),
    };
    const policySanitizer = {
      sanitizeLastUserMessageForRetry: jest.fn(),
    };

    const agent = new AgentFlowAgent(
      {} as never,
      toolsRegistrar as never,
      promptBuilder as never,
      policySanitizer as never
    );

    return { agent, toolsRegistrar, promptBuilder, policySanitizer };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns result on first attempt without sanitizer retry', async () => {
    const { agent, promptBuilder, policySanitizer } = createAgent();
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
    expect(output.context.request).toEqual(request);
  });

  it('retries once with sanitized message after policy error', async () => {
    const { agent, promptBuilder, policySanitizer } = createAgent();
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
    expect(output.context.request).toEqual(sanitizedRequest);
    expect(output.context.sanitizedLastUserMessage).toBe('safe SQL request');
    expect(output.result).toEqual({
      decision: 'explain',
      explanation: 'ok after retry',
      reasonDescription: 'Second attempt succeeded after prompt sanitization.',
    });
  });

  it('throws restricted error when retry also fails with policy error', async () => {
    const { agent, policySanitizer } = createAgent();
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
  });
});
