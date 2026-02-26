import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiMessage } from '../../../common/ai-insights/agent/ai-core';
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

@Injectable()
export class AgentFlowAgent {
  private readonly logger = new Logger(AgentFlowAgent.name);

  constructor(
    @Inject(AI_CHAT_PROVIDER) private readonly aiProvider: AiChatProvider,
    private readonly toolsRegistrar: AgentFlowToolsRegistrar,
    private readonly promptBuilder: AgentFlowPromptBuilder,
    private readonly policySanitizer: AgentFlowPolicySanitizerService
  ) {}

  async run(
    request: AgentFlowRequest,
    telemetry: AgentTelemetry,
    promptContext: AgentFlowPromptContext
  ): Promise<{ result: AgentFlowResult; context: AgentFlowContext }> {
    // Build a fresh ToolRegistry and register agent-flow tools
    const toolRegistry = new ToolRegistry();
    this.toolsRegistrar.registerTools(toolRegistry);

    // Build the agent context — tools read from and write to this
    const agentContext: AgentFlowContext = {
      telemetry,
      request,
      collectedProposedActions: [],
    };
    let currentRequest = request;
    let currentPromptContext = promptContext;
    let lastSanitizedUserMessage: string | null = null;

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
        const { result } = await this.runLoop({
          request: currentRequest,
          promptContext: currentPromptContext,
          toolRegistry,
          tools,
          telemetry,
          agentContext,
        });

        return { result, context: agentContext };
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
        agentContext.sanitizedLastUserMessage = recovery.sanitizedLastUserMessage;
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
  }): Promise<{ result: AgentFlowResult }> {
    const { request, promptContext, toolRegistry, tools, telemetry, agentContext } = params;
    agentContext.request = request;

    const initialMessages: AiMessage[] = this.promptBuilder.buildInitialMessages({
      request,
      promptContext,
    });

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
}
