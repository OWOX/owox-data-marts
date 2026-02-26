import { Injectable, Logger } from '@nestjs/common';
import { AgentTelemetry } from '../../../common/ai-insights/agent/types';
import { PromptSanitizerService } from '../../../common/ai-insights/services/prompt-sanitizer.service';
import { appendSanitizeTelemetry } from './agent-telemetry.utils';
import { getLastUserMessage, replaceLastUserMessage } from './ai-assistant-orchestrator.utils';
import { AgentFlowPromptContext, AgentFlowRequest } from './types';

export class AgentFlowContentPolicyRestrictedError extends Error {
  constructor(public readonly sanitizedLastUserMessage: string | null) {
    super('Blocked by AI content filter.');
  }
}

export type AgentFlowPolicySanitizationResult =
  | { type: 'restricted'; sanitizedLastUserMessage: string | null }
  | {
      type: 'retry';
      request: AgentFlowRequest;
      promptContext: AgentFlowPromptContext;
      sanitizedLastUserMessage: string;
    };

@Injectable()
export class AgentFlowPolicySanitizerService {
  private readonly logger = new Logger(AgentFlowPolicySanitizerService.name);

  constructor(private readonly promptSanitizer: PromptSanitizerService) {}

  async sanitizeLastUserMessageForRetry(params: {
    request: AgentFlowRequest;
    promptContext: AgentFlowPromptContext;
    telemetry: AgentTelemetry;
  }): Promise<AgentFlowPolicySanitizationResult> {
    const { request, promptContext, telemetry } = params;

    const latestUserMessage =
      getLastUserMessage(promptContext.recentTurns) || getLastUserMessage(request.history);
    if (!latestUserMessage.trim()) {
      return { type: 'restricted', sanitizedLastUserMessage: null };
    }

    const sanitizeResult = await this.promptSanitizer.sanitizePrompt(latestUserMessage);
    appendSanitizeTelemetry(telemetry, sanitizeResult);

    const sanitizedPrompt = sanitizeResult?.prompt?.trim() ?? '';
    if (!sanitizedPrompt || sanitizedPrompt === latestUserMessage.trim()) {
      this.logger.warn('Policy sanitizer could not produce safer prompt');
      return { type: 'restricted', sanitizedLastUserMessage: null };
    }

    return {
      type: 'retry',
      request: {
        ...request,
        history: replaceLastUserMessage(request.history, sanitizedPrompt),
      },
      promptContext: {
        ...promptContext,
        recentTurns: replaceLastUserMessage(promptContext.recentTurns, sanitizedPrompt),
      },
      sanitizedLastUserMessage: sanitizedPrompt,
    };
  }
}
