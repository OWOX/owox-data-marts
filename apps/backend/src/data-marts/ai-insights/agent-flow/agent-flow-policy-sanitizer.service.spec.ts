jest.mock('../../../common/ai-insights/services/prompt-sanitizer.service', () => ({
  PromptSanitizerService: function PromptSanitizerServiceMock() {},
}));

import { createTelemetry } from './agent-telemetry.utils';
import { AiAssistantMessageRole } from '../../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../../enums/ai-assistant-scope.enum';
import { AgentFlowPolicySanitizerService } from './agent-flow-policy-sanitizer.service';
import { AgentFlowPromptContext } from './types';

describe('AgentFlowPolicySanitizerService', () => {
  const createRequest = () => ({
    projectId: 'project-1',
    dataMartId: 'data-mart-1',
    history: [
      {
        role: AiAssistantMessageRole.USER,
        content: 'Please build SQL for purchases',
        createdAt: '2026-02-21T10:00:00.000Z',
      },
    ],
    sessionContext: {
      sessionId: 'session-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
    },
  });

  const createPromptContext = (): AgentFlowPromptContext => ({
    recentTurns: [
      {
        role: AiAssistantMessageRole.USER,
        content: 'Please build SQL for purchases',
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

  it('sanitizes latest user message even when it is not the first turn', async () => {
    const promptSanitizer = {
      sanitizePrompt: jest.fn().mockResolvedValue({
        prompt: 'refine SQL with monthly breakdown',
      }),
    };
    const service = new AgentFlowPolicySanitizerService(promptSanitizer as never);
    const request = createRequest();
    request.history.push({
      role: AiAssistantMessageRole.ASSISTANT,
      content: 'assistant reply',
      createdAt: '2026-02-21T10:01:00.000Z',
    });
    request.history.push({
      role: AiAssistantMessageRole.USER,
      content: 'refine SQL',
      createdAt: '2026-02-21T10:02:00.000Z',
    });
    const promptContext = createPromptContext();
    promptContext.recentTurns = [...request.history];

    const result = await service.sanitizeLastUserMessageForRetry({
      request,
      promptContext,
      telemetry: createTelemetry(),
    });

    expect(promptSanitizer.sanitizePrompt).toHaveBeenCalledWith('refine SQL');
    expect(result.type).toBe('retry');
  });

  it('returns restricted when sanitizer cannot improve prompt', async () => {
    const promptSanitizer = {
      sanitizePrompt: jest.fn().mockResolvedValue({
        prompt: 'Please build SQL for purchases',
      }),
    };
    const service = new AgentFlowPolicySanitizerService(promptSanitizer as never);

    const result = await service.sanitizeLastUserMessageForRetry({
      request: createRequest(),
      promptContext: createPromptContext(),
      telemetry: createTelemetry(),
    });

    expect(result).toEqual({
      type: 'restricted',
      sanitizedLastUserMessage: null,
    });
  });

  it('returns retry with sanitized prompt and appends telemetry', async () => {
    const promptSanitizer = {
      sanitizePrompt: jest.fn().mockResolvedValue({
        prompt: 'Build monthly SQL for purchases in 2025',
        usage: {
          executionTime: 1,
          promptTokens: 2,
          completionTokens: 3,
          reasoningTokens: 4,
          totalTokens: 5,
        },
        model: 'sanitizer-model',
        finishReason: 'stop',
      }),
    };
    const service = new AgentFlowPolicySanitizerService(promptSanitizer as never);
    const request = createRequest();
    const promptContext = createPromptContext();
    const telemetry = createTelemetry();

    const result = await service.sanitizeLastUserMessageForRetry({
      request,
      promptContext,
      telemetry,
    });

    expect(result.type).toBe('retry');
    if (result.type !== 'retry') {
      throw new Error('expected retry result');
    }

    expect(result.sanitizedLastUserMessage).toBe('Build monthly SQL for purchases in 2025');
    expect(result.request.history[0].content).toBe('Build monthly SQL for purchases in 2025');
    expect(result.promptContext.recentTurns[0].content).toBe(
      'Build monthly SQL for purchases in 2025'
    );
    expect(telemetry.llmCalls).toEqual([
      expect.objectContaining({
        model: 'sanitizer-model',
        reasoningPreview: 'prompt_sanitizer',
      }),
    ]);
  });
});
