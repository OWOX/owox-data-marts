import { Inject, Injectable, Logger } from '@nestjs/common';
import { OpenAiToolCallingClient } from '../../common/ai-insights/services/openai/openai-tool-calling.client';
import { ToolRegistryService } from '../../common/ai-insights/agent/tool-registry.service';
import {
  AI_INSIGHTS_TOOLS_REGISTRARS,
  AiInsightsToolsRegistrar,
} from '../../common/ai-insights/services/ai-insights-tools-registrar';
import { castError } from '@owox/internal-helpers';
import { buildSystemPrompt, buildUserPrompt } from './prompts/llm-prompt';
import {
  AnswerPromptRequest,
  AnswerPromptResponse,
  DataMartInsightsContext,
} from './ai-insights-types';
import { AgentBudgets, AgentTelemetry, ChatMessage } from '../../common/ai-insights/agent/types';

/**
 * LLM-native tool-calling agent that lets the model decide which tools to call
 * in order to answer the prompt.
 */
@Injectable()
export class AiInsightsAgentService {
  private readonly logger = new Logger(AiInsightsAgentService.name);

  constructor(
    private readonly client: OpenAiToolCallingClient,
    private readonly registry: ToolRegistryService,
    @Inject(AI_INSIGHTS_TOOLS_REGISTRARS)
    private readonly registrars: AiInsightsToolsRegistrar[]
  ) {}

  async answerPrompt(request: AnswerPromptRequest): Promise<AnswerPromptResponse> {
    const budgets: AgentBudgets = {
      maxRows: request.options?.maxRows,
      maxBytesProcessed: request.options?.maxBytesProcessed,
    };

    const telemetry: AgentTelemetry = {
      llmCalls: [],
      toolCalls: [],
      messageHistory: [],
    };

    const context: DataMartInsightsContext = {
      projectId: request.projectId,
      dataMartId: request.dataMartId,
      prompt: request.prompt,
      telemetry,
      budgets,
    };

    // Build toolset for this run via registrars (no onModuleInit side effects)
    this.registry.clear();
    for (const registrar of this.registrars ?? []) {
      try {
        registrar.registerTools(this.registry);
      } catch (e) {
        this.logger.warn(`Registrar failed`, { stack: castError(e).stack });
      }
    }

    const tools = this.registry.getOpenAiTools();

    const system = buildSystemPrompt(budgets);
    const user = buildUserPrompt(request);

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];

    const maxTurns = 16;
    for (let turn = 0; turn < maxTurns; turn++) {
      const assistant = await this.client.createChatCompletion(messages, {
        tools,
        toolChoice: 'auto',
      });

      telemetry.llmCalls.push({
        turn,
        model: assistant.model,
        finishReason: assistant.reasoning,
        usage: assistant.usage,
        reasoningPreview: assistant.content,
      });

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: assistant.content,
        tool_calls: assistant.toolCalls,
      };
      messages.push(assistantMessage);
      telemetry.messageHistory.push(assistantMessage);

      const toolCalls = assistant.toolCalls;
      if (!toolCalls || toolCalls.length === 0) {
        this.logger.debug('No tool calls from assistant', { assistant: assistant });
        // No tool calls means the model is done.
        const noToolCallMessage: ChatMessage = {
          role: 'system',
          content: `important: use finalize tool to return prompt answer`,
        };
        messages.push(noToolCallMessage);
        telemetry.messageHistory.push(noToolCallMessage);
        continue;
      }

      for (const tc of toolCalls) {
        const argsJson = tc.function.arguments || '{}';
        try {
          const toolResult = await this.registry.executeToToolMessage(
            tc.function.name,
            argsJson,
            context
          );
          telemetry.toolCalls.push({
            turn,
            name: tc.function.name,
            argsJson,
            success: true,
          });
          this.logger.log(`Executed tool: ${tc.function.name}`, {
            name: tc.function.name,
            arguments: tc.function.arguments || '{}',
            toolResult: toolResult,
          });
          if (toolResult.isFinal) {
            return toolResult.content;
          }
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(toolResult.content),
          });
        } catch (e) {
          telemetry.toolCalls.push({
            turn,
            name: tc.function.name,
            argsJson,
            success: false,
            errorMessage: castError(e).message,
          });
          this.logger.warn(`Tool execution failed for ${tc.function.name}`, {
            stack: castError(e).stack,
          });
          messages.push({
            role: 'system',
            content: `Tool ${tc.function.name} failed with error: ${castError(e).message}. Please adjust and try again.`,
          });
        }
      }
    }

    throw new Error(`Agent did not complete within turn limit: ${maxTurns} .`);
  }
}
