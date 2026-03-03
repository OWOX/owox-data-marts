import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiMessage, AiRole } from '../../../common/ai-insights/agent/ai-core';
import { AiChatProvider } from '../../../common/ai-insights/agent/ai-core';
import { AI_CHAT_PROVIDER } from '../../../common/ai-insights/services/ai-chat-provider.token';
import { AiContentFilterError } from '../../../common/ai-insights/services/error';
import { runAgentLoop } from '../../../common/ai-insights/llm-tool-runner';
import { AgentTelemetry } from '../../../common/ai-insights/agent/types';
import { ToolRegistry } from '../../../common/ai-insights/agent/tool-registry';
import {
  AgentFlowContext,
  AgentFlowPromptContext,
  AgentFlowRequest,
  AgentFlowResult,
  AgentFlowResultSchema,
} from './types';
import { AgentFlowToolsRegistrar, AgentFlowTools } from './agent-flow-tools.registrar';
import { AgentFlowPromptBuilder } from '../../services/agent-flow-prompt-builder.service';
import {
  AgentFlowContentPolicyRestrictedError,
  AgentFlowPolicySanitizerService,
} from './agent-flow-policy-sanitizer.service';
import { resolveAgentFlowProposedActions } from './agent-flow-proposed-actions.utils';
import { AgentFlowValidationRetryRulesService } from './agent-flow-validation-retry-rules.service';
import { AgentFlowValidationRetryEngineService } from './agent-flow-validation-retry-engine.service';
import {
  AgentFlowValidationContext,
  createAgentFlowValidationRetryState,
} from './agent-flow-validation-retry.types';

@Injectable()
export class AgentFlowAgent {
  private readonly logger = new Logger(AgentFlowAgent.name);

  constructor(
    @Inject(AI_CHAT_PROVIDER) private readonly aiProvider: AiChatProvider,
    private readonly toolsRegistrar: AgentFlowToolsRegistrar,
    private readonly promptBuilder: AgentFlowPromptBuilder,
    private readonly policySanitizer: AgentFlowPolicySanitizerService,
    private readonly validationRetryRules: AgentFlowValidationRetryRulesService,
    private readonly validationRetryEngine: AgentFlowValidationRetryEngineService
  ) {}

  async run(
    request: AgentFlowRequest,
    telemetry: AgentTelemetry,
    promptContext: AgentFlowPromptContext
  ): Promise<{ result: AgentFlowResult; context: AgentFlowContext }> {
    // Build a fresh ToolRegistry and register agent-flow tools
    const toolRegistry = new ToolRegistry();
    this.toolsRegistrar.registerTools(toolRegistry);

    let currentRequest = request;
    let currentPromptContext = promptContext;
    let lastSanitizedUserMessage: string | null = null;
    let validationRetryFeedback: string | null = null;
    const rules = this.validationRetryRules.getRules();
    let validationRetryState = createAgentFlowValidationRetryState();

    const tools = toolRegistry.findToolByNames([
      AgentFlowTools.LIST_TEMPLATE_SOURCES,
      AgentFlowTools.LIST_ARTIFACTS,
      AgentFlowTools.GET_TEMPLATE_CONTENT,
      AgentFlowTools.PROPOSE_REMOVE_SOURCE,
      AgentFlowTools.GENERATE_SQL,
      AgentFlowTools.LIST_AVAILABLE_TAGS,
    ]);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        while (true) {
          const agentContext = this.createAttemptContext({
            telemetry,
            request: currentRequest,
            sanitizedLastUserMessage: lastSanitizedUserMessage,
          });
          const { result } = await this.runLoop({
            request: currentRequest,
            promptContext: currentPromptContext,
            toolRegistry,
            tools,
            telemetry,
            agentContext,
            validationRetryFeedback,
          });
          const resolvedProposedActions = resolveAgentFlowProposedActions({
            resultProposedActions: result.proposedActions,
            contextProposedActions: agentContext.collectedProposedActions,
            templateEditIntent: result.templateEditIntent,
          });
          const validationContext: AgentFlowValidationContext = {
            result,
            resolvedProposedActions,
            stateSnapshot: currentPromptContext.stateSnapshot,
          };
          const validationResult = this.validationRetryEngine.evaluate({
            rules,
            context: validationContext,
            state: validationRetryState,
          });
          if (validationResult.type === 'retry') {
            validationRetryFeedback = validationResult.feedback;
            this.logger.warn(validationResult.logMessage, {
              retry: validationResult.retry,
              ruleKey: validationResult.ruleKey,
              ...validationResult.logMeta,
            });
            continue;
          }

          return { result, context: agentContext };
        }
      } catch (error: unknown) {
        if (!(error instanceof AiContentFilterError)) {
          throw error;
        }

        if (attempt === 1) {
          throw new AgentFlowContentPolicyRestrictedError(lastSanitizedUserMessage);
        }

        const recovery = await this.policySanitizer.sanitizeLastUserMessageForRetry({
          request: currentRequest,
          promptContext: currentPromptContext,
          telemetry,
        });

        if (recovery.type === 'restricted') {
          throw new AgentFlowContentPolicyRestrictedError(recovery.sanitizedLastUserMessage);
        }

        currentRequest = recovery.request;
        currentPromptContext = recovery.promptContext;
        lastSanitizedUserMessage = recovery.sanitizedLastUserMessage;
        validationRetryFeedback = null;
        validationRetryState = createAgentFlowValidationRetryState();
      }
    }

    throw new AgentFlowContentPolicyRestrictedError(lastSanitizedUserMessage);
  }

  private async runLoop(params: {
    request: AgentFlowRequest;
    promptContext: AgentFlowPromptContext;
    toolRegistry: ToolRegistry;
    tools: ReturnType<ToolRegistry['findToolByNames']>;
    telemetry: AgentTelemetry;
    agentContext: AgentFlowContext;
    validationRetryFeedback?: string | null;
  }): Promise<{ result: AgentFlowResult }> {
    const {
      request,
      promptContext,
      toolRegistry,
      tools,
      telemetry,
      agentContext,
      validationRetryFeedback,
    } = params;
    agentContext.request = request;

    const initialMessages: AiMessage[] = this.promptBuilder.buildInitialMessages({
      request,
      promptContext,
    });
    if (validationRetryFeedback) {
      initialMessages.push({
        role: AiRole.SYSTEM,
        content: validationRetryFeedback,
      });
    }

    return runAgentLoop<typeof AgentFlowResultSchema, AgentFlowResult>({
      aiProvider: this.aiProvider,
      toolRegistry,
      context: agentContext,
      telemetry,
      initialMessages,
      tools,
      maxTurns: 10,
      temperature: 0,
      maxTokens: 4000,
      resultSchema: AgentFlowResultSchema,
      logger: this.logger,
    });
  }

  private createAttemptContext(params: {
    telemetry: AgentTelemetry;
    request: AgentFlowRequest;
    sanitizedLastUserMessage: string | null;
  }): AgentFlowContext {
    return {
      telemetry: params.telemetry,
      request: params.request,
      collectedProposedActions: [],
      sanitizedLastUserMessage: params.sanitizedLastUserMessage,
    };
  }
}
