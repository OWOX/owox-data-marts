import { castError, extractJsonFromText, parseJsonWithSchema } from '@owox/internal-helpers';
import { buildJsonSchema } from './utils/build-json-schema-by-zod-schema';
import { AiChatProvider, AiChatRequest, AiMessage, AiRole, AiToolCall } from './agent/ai-core';
import {
  AgentTelemetry,
  AiContext,
  ToolExecutionRecord,
  ToolLoopOptions,
  ToolLoopOutput,
  ToolMessageProcessor,
  ToolRunResult,
} from './agent/types';
import { ZodTypeAny, z } from 'zod';
import { Logger } from '@nestjs/common';
import { ToolRegistry } from './agent/tool-registry';

/**
 * Generic multi-turn tool-calling loop.
 * - Executes tools via ToolRegistry.
 * - Stops when an assistant message has no toolCalls.
 * - Returns parsed JSON result (validated by finalJsonSchema) AND all tool executions.
 */
export async function runAgentLoop<TSchema extends ZodTypeAny, TResult = z.infer<TSchema>>(
  options: ToolLoopOptions
): Promise<ToolLoopOutput<TResult>> {
  const {
    aiProvider,
    toolRegistry,
    context,
    telemetry,
    initialMessages,
    tools,
    maxTurns,
    temperature,
    maxTokens,
    logger,
    resultSchema,
    messageProcessors,
  } = options;

  const messages: AiMessage[] = [...initialMessages];
  const toolExecutions: ToolExecutionRecord[] = [];

  for (let turn = 0; turn < maxTurns; turn++) {
    const aiChatRequest: AiChatRequest = {
      messages,
      tools,
      toolMode: 'auto',
      temperature,
      maxTokens,
    };

    const aiChatResponse = await aiProvider.chat(aiChatRequest);
    const assistantMessage: AiMessage = aiChatResponse.message;

    telemetry.llmCalls.push({
      turn,
      model: aiChatResponse.model,
      finishReason: aiChatResponse.finishReason,
      usage: aiChatResponse.usage,
      reasoningPreview: aiChatResponse.message.content,
    });

    messages.push(assistantMessage);
    telemetry.messageHistory.push(assistantMessage);

    const toolCalls = assistantMessage.toolCalls;

    if (!toolCalls || toolCalls.length === 0) {
      const fixed = await ensureValidJson({
        schema: resultSchema,
        messages,
        aiProvider,
        telemetry,
        logger,
        temperature,
        maxTokens,
      });

      const parsed = parseJsonWithSchema(resultSchema, fixed.content, 'Response') as TResult;

      return {
        result: parsed,
        messages,
        toolExecutions,
      };
    }

    await executeToolCalls({
      toolCalls,
      toolRegistry,
      context,
      messages,
      telemetry,
      logger,
      messageProcessors,
      toolExecutions,
    });
  }

  throw new Error(`Tool loop did not complete within turn limit: ${maxTurns}`);
}

async function ensureValidJson(params: {
  aiProvider: AiChatProvider;
  telemetry: AgentTelemetry;
  logger: Logger;
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
  schema: ZodTypeAny;
}): Promise<AiMessage> {
  const { aiProvider, telemetry, logger, messages, temperature, maxTokens, schema } = params;
  let lastValidationError = '';

  let finalAssistant = messages[messages.length - 1];

  // 1) Try to validate raw content as-is
  try {
    parseJsonWithSchema(schema, finalAssistant.content, 'Response');
    return finalAssistant;
  } catch (error: unknown) {
    lastValidationError = castError(error).message;
    logger.debug('FinalResponse: invalid JSON or schema mismatch on raw content.', {
      error: castError(error),
    });
  }

  // 2) Try to extract a clean JSON substring from the content
  const extracted = extractJsonFromText(finalAssistant.content);
  if (extracted) {
    try {
      parseJsonWithSchema(schema, extracted, 'ResponseExtracted');

      // If OK, overwrite content with cleaned JSON and return without extra LLM call
      finalAssistant = {
        ...finalAssistant,
        content: extracted,
      };
      messages[messages.length - 1] = finalAssistant;
      telemetry.messageHistory[telemetry.messageHistory.length - 1] = finalAssistant;

      logger.debug('FinalResponse: successfully fixed JSON locally (no LLM call needed).');
      return finalAssistant;
    } catch (error: unknown) {
      lastValidationError = castError(error).message;
      logger.log(
        'FinalResponse: extracted JSON still does not match schema, will ask model to fix.',
        { error: castError(error) }
      );
    }
  } else {
    logger.log('FinalResponse: could not extract JSON substring, will ask model to fix.');
  }

  // 3) Fallback: ask model to re-output pure JSON object with specific error details
  const lastAssistantContent = finalAssistant.content ?? '';
  const schemaDescription = JSON.stringify(buildJsonSchema(schema), null, 2);

  const fixSystemMessage: AiMessage = {
    role: AiRole.SYSTEM,
    content:
      'The previous assistant message was not valid JSON or did not match the required JSON schema.\n\n' +
      `Validation error: ${lastValidationError}\n\n` +
      `Expected JSON schema:\n${schemaDescription}\n\n` +
      'You MUST now respond with ONLY a valid JSON object that matches the schema above. ' +
      'Do not include any explanations, comments, or Markdown. Only the JSON object.',
  };

  // Trim context: keep only system prompt + last assistant message + fix instruction
  const systemMessage = messages.find(m => m.role === AiRole.SYSTEM);
  const fixMessages: AiMessage[] = [
    ...(systemMessage ? [systemMessage] : []),
    { role: AiRole.ASSISTANT, content: lastAssistantContent },
    fixSystemMessage,
  ];

  // Also push to full history for telemetry
  messages.push(fixSystemMessage);
  telemetry.messageHistory.push(fixSystemMessage);

  const fixRequest: AiChatRequest = {
    messages: fixMessages,
    tools: [],
    toolMode: 'auto',
    temperature,
    maxTokens,
    responseFormat: { type: 'json_object' },
  };

  const fixResponse = await aiProvider.chat(fixRequest);

  finalAssistant = fixResponse.message;
  messages.push(finalAssistant);
  telemetry.messageHistory.push(finalAssistant);

  try {
    parseJsonWithSchema(schema, finalAssistant.content, 'FixedResponse');
    return finalAssistant;
  } catch (error: unknown) {
    const castedError = castError(error);
    logger.error('FixedResponse: still invalid after JSON fix attempt.', castedError);
    throw new Error(
      `FixedResponse: message is not valid JSON after fix attempt: ${castedError.message}`
    );
  }
}

async function executeToolCalls(params: {
  toolCalls: AiToolCall[];
  toolRegistry: ToolRegistry;
  context: AiContext;
  messages: AiMessage[];
  telemetry: AgentTelemetry;
  logger: Logger;
  toolExecutions: ToolExecutionRecord[];
  messageProcessors?: Record<string, ToolMessageProcessor>;
}) {
  const {
    toolCalls,
    toolRegistry,
    context,
    messages,
    telemetry,
    logger,
    toolExecutions,
    messageProcessors,
  } = params;

  for (const toolCall of toolCalls) {
    const argsJson = toolCall.argumentsJson ?? '{}';

    try {
      const toolResult: ToolRunResult = await toolRegistry.executeToToolMessage(
        toolCall.name,
        argsJson,
        context
      );

      telemetry.toolCalls.push({
        turn: telemetry.llmCalls.length - 1,
        name: toolCall.name,
        argsJson,
        success: true,
        toolResult: toolResult.content,
      });
      toolExecutions.push({
        name: toolCall.name,
        callId: toolCall.id,
        argsJson,
        result: toolResult,
      });

      logger.log(`Executed tool: ${toolCall.name}`, { arguments: argsJson });

      const processor = messageProcessors?.[toolCall.name];

      const messageContent =
        processor?.({
          toolName: toolCall.name,
          toolResult,
          argsJson,
          context,
          messages,
        }) ?? JSON.stringify(toolResult.content);

      messages.push({
        role: AiRole.TOOL,
        toolName: toolCall.name,
        callId: toolCall.id,
        content: messageContent,
      });
      telemetry.messageHistory.push(messages[messages.length - 1]);
    } catch (error: unknown) {
      const castedError = castError(error);

      telemetry.toolCalls.push({
        turn: telemetry.llmCalls.length - 1,
        name: toolCall.name,
        argsJson,
        success: false,
        errorMessage: castedError.message,
      });
      logger.warn(`Tool execution failed for ${toolCall.name}`, { stack: castedError.stack });

      messages.push({
        role: AiRole.TOOL,
        toolName: toolCall.name,
        callId: toolCall.id,
        content: `Tool ${toolCall.name} failed with error: ${castedError.message}. Please adjust and try again.`,
      });
      telemetry.messageHistory.push(messages[messages.length - 1]);
    }
  }
}
