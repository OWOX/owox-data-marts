import { Inject, Injectable, Logger } from '@nestjs/common';
import { AI_CHAT_PROVIDER } from '../../common/ai-insights/services/ai-chat-provider.token';
import { castError } from '@owox/internal-helpers';
import { buildSystemPrompt, buildUserPrompt } from './prompts/llm-prompt';
import {
  AnswerPromptRequest,
  AnswerPromptResponse,
  DataMartInsightsContext,
} from './ai-insights-types';
import { AgentBudgets, AgentTelemetry } from '../../common/ai-insights/agent/types';
import { ToolRegistry } from '../../common/ai-insights/agent/tool-registry';
import {
  AiChatProvider,
  AiChatRequest,
  AiMessage,
  AiRole,
} from '../../common/ai-insights/agent/ai-core';

/**
 * LLM-native tool-calling agent that lets the model decide which tools to call
 * in order to answer the prompt.
 */
@Injectable()
export class AiInsightsAgentService {
  private readonly logger = new Logger(AiInsightsAgentService.name);

  constructor(
    @Inject(AI_CHAT_PROVIDER) private readonly aiProvider: AiChatProvider,
    private readonly toolRegistry: ToolRegistry
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

    const tools = this.toolRegistry.getAiTools();

    const system = buildSystemPrompt(budgets);
    const user = buildUserPrompt(request);

    const messages: AiMessage[] = [
      { role: AiRole.SYSTEM, content: system },
      { role: AiRole.USER, content: user },
    ];

    const maxTurns = 16;
    for (let turn = 0; turn < maxTurns; turn++) {
      const aiChatRequest: AiChatRequest = {
        messages,
        tools,
        toolMode: 'auto',
      };

      const aiChatResponse = await this.aiProvider.chat(aiChatRequest);

      telemetry.llmCalls.push({
        turn,
        model: aiChatResponse.model,
        finishReason: aiChatResponse.finishReason,
        usage: aiChatResponse.usage,
        reasoningPreview: aiChatResponse.message.content,
      });

      const assistantMessage: AiMessage = aiChatResponse.message;
      messages.push(assistantMessage);
      telemetry.messageHistory.push(assistantMessage);

      const toolCalls = aiChatResponse.message.toolCalls;
      if (!toolCalls || toolCalls.length === 0) {
        this.logger.debug('No tool calls from assistant', { aiChatResponse });
        const noToolCallMessage: AiMessage = {
          role: AiRole.SYSTEM,
          content: `important: use finalize tool ${this.toolRegistry.findFinalTool().name} to return prompt answer`,
        };
        messages.push(noToolCallMessage);
        telemetry.messageHistory.push(noToolCallMessage);
        continue;
      }

      for (const toolCall of toolCalls) {
        const argsJson = toolCall.argumentsJson || '{}';
        try {
          const toolResult = await this.toolRegistry.executeToToolMessage(
            toolCall.name,
            argsJson,
            context
          );
          telemetry.toolCalls.push({
            turn,
            name: toolCall.name,
            argsJson,
            success: true,
          });
          this.logger.log(`Executed tool: ${toolCall.name}`, {
            name: toolCall.name,
            arguments: argsJson || '{}',
            toolResult: toolResult,
          });
          if (toolResult.isFinal) {
            return toolResult.content;
          }
          messages.push({
            role: AiRole.TOOL,
            toolName: toolCall.name,
            callId: toolCall.id,
            content: JSON.stringify(toolResult.content),
          });
        } catch (e) {
          telemetry.toolCalls.push({
            turn,
            name: toolCall.name,
            argsJson,
            success: false,
            errorMessage: castError(e).message,
          });
          this.logger.warn(`Tool execution failed for ${toolCall.name}`, {
            stack: castError(e).stack,
          });
          messages.push({
            role: AiRole.SYSTEM,
            content: `Tool ${toolCall.name} failed with error: ${castError(e).message}. Please adjust and try again.`,
          });
        }
      }
    }

    throw new Error(`Agent did not complete within turn limit: ${maxTurns} .`);
  }
}
