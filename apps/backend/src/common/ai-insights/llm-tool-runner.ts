import { castError, extractJsonFromText, parseJsonWithSchema } from '@owox/internal-helpers';
import { buildJsonSchema } from './utils/build-json-schema-by-zod-schema';
import { AiChatProvider, AiChatRequest, AiMessage, AiRole, AiToolCall } from './agent/ai-core';
import {
  AgentTelemetry,
  AiContext,
  ToolExecutionPolicy,
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
    executionPolicy,
    messageProcessors,
  } = options;

  if (shouldUseExecutionPolicy(executionPolicy)) {
    validateExecutionPolicy({
      tools,
      executionPolicy,
    });
  }

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
      executionPolicy,
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

interface ScheduledToolCall {
  index: number;
  toolCall: AiToolCall;
  argsJson: string;
  dependsOnIndices: Set<number>;
  runAlone: boolean;
}

interface ExecutedToolCallResult {
  scheduled: ScheduledToolCall;
  status: 'success' | 'error';
  toolResult?: ToolRunResult;
  error?: Error;
}

function shouldUseExecutionPolicy(
  executionPolicy?: ToolExecutionPolicy
): executionPolicy is ToolExecutionPolicy {
  if (!executionPolicy) {
    return false;
  }

  return Object.keys(executionPolicy.rules).length > 0;
}

function validateExecutionPolicy(params: {
  tools: ReturnType<ToolRegistry['getAiTools']>;
  executionPolicy: ToolExecutionPolicy;
}): void {
  const { tools, executionPolicy } = params;
  const availableToolNames = new Set(tools.map(tool => tool.name));
  const ruleNames = Object.keys(executionPolicy.rules);

  const missingRules = [...availableToolNames].filter(
    toolName => !(toolName in executionPolicy.rules)
  );
  if (missingRules.length > 0) {
    throw new Error(`Execution policy is missing rules for tools: ${missingRules.join(', ')}`);
  }

  const unknownRules = ruleNames.filter(ruleName => !availableToolNames.has(ruleName));
  if (unknownRules.length > 0) {
    throw new Error(`Execution policy has unknown tool rules: ${unknownRules.join(', ')}`);
  }

  for (const [toolName, rule] of Object.entries(executionPolicy.rules)) {
    const dependsOn = rule.dependsOn ?? [];
    for (const dependency of dependsOn) {
      if (!availableToolNames.has(dependency)) {
        throw new Error(
          `Execution policy for "${toolName}" depends on unknown tool "${dependency}"`
        );
      }

      if (dependency === toolName) {
        throw new Error(`Execution policy for "${toolName}" cannot depend on itself`);
      }
    }
  }

  validateExecutionPolicyCycles(executionPolicy, [...availableToolNames]);
}

function validateExecutionPolicyCycles(
  executionPolicy: ToolExecutionPolicy,
  tools: string[]
): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (toolName: string) => {
    if (visited.has(toolName)) {
      return;
    }

    if (visiting.has(toolName)) {
      throw new Error(`Execution policy contains dependency cycle involving "${toolName}"`);
    }

    visiting.add(toolName);
    const dependencies = executionPolicy.rules[toolName]?.dependsOn ?? [];
    for (const dependency of dependencies) {
      visit(dependency);
    }
    visiting.delete(toolName);
    visited.add(toolName);
  };

  for (const toolName of tools) {
    visit(toolName);
  }
}

function buildScheduledToolCalls(
  toolCalls: AiToolCall[],
  executionPolicy?: ToolExecutionPolicy
): ScheduledToolCall[] {
  if (!shouldUseExecutionPolicy(executionPolicy)) {
    return toolCalls.map((toolCall, index) => ({
      index,
      toolCall,
      argsJson: toolCall.argumentsJson ?? '{}',
      dependsOnIndices: index > 0 ? new Set([index - 1]) : new Set<number>(),
      runAlone: false,
    }));
  }

  const callIndexesByToolName = new Map<string, number[]>();

  toolCalls.forEach((toolCall, index) => {
    const indexes = callIndexesByToolName.get(toolCall.name) ?? [];
    indexes.push(index);
    callIndexesByToolName.set(toolCall.name, indexes);
  });

  return toolCalls.map((toolCall, index) => {
    const rule = executionPolicy.rules[toolCall.name];
    if (!rule) {
      throw new Error(`Execution policy rule is not defined for tool "${toolCall.name}"`);
    }

    const dependsOnIndices = new Set<number>();
    const dependencies = rule.dependsOn ?? [];

    for (const dependencyToolName of dependencies) {
      const dependencyIndexes = callIndexesByToolName.get(dependencyToolName) ?? [];
      for (const dependencyIndex of dependencyIndexes) {
        dependsOnIndices.add(dependencyIndex);
      }
    }

    return {
      index,
      toolCall,
      argsJson: toolCall.argumentsJson ?? '{}',
      dependsOnIndices,
      runAlone: rule.runAlone === true,
    };
  });
}

function selectReadyBatch(
  pendingCalls: ScheduledToolCall[],
  completedIndexes: Set<number>
): ScheduledToolCall[] {
  const readyCalls = pendingCalls
    .filter(call => [...call.dependsOnIndices].every(index => completedIndexes.has(index)))
    .sort((left, right) => left.index - right.index);

  if (readyCalls.length === 0) {
    return [];
  }

  const runAloneCall = readyCalls.find(call => call.runAlone);
  if (runAloneCall) {
    return [runAloneCall];
  }

  return readyCalls;
}

function unresolvedCallsDebugString(
  pendingCalls: ScheduledToolCall[],
  completedIndexes: Set<number>
): string {
  return pendingCalls
    .map(call => {
      const unresolvedDeps = [...call.dependsOnIndices]
        .filter(index => !completedIndexes.has(index))
        .join(', ');
      return `${call.toolCall.name}#${call.index}${unresolvedDeps ? ` <- [${unresolvedDeps}]` : ''}`;
    })
    .join('; ');
}

async function executeToolCalls(params: {
  toolCalls: AiToolCall[];
  toolRegistry: ToolRegistry;
  context: AiContext;
  messages: AiMessage[];
  telemetry: AgentTelemetry;
  logger: Logger;
  toolExecutions: ToolExecutionRecord[];
  executionPolicy?: ToolExecutionPolicy;
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
    executionPolicy,
    messageProcessors,
  } = params;

  const scheduledCalls = buildScheduledToolCalls(toolCalls, executionPolicy);
  const completedIndexes = new Set<number>();
  const pendingCalls = new Map(scheduledCalls.map(call => [call.index, call] as const));

  while (pendingCalls.size > 0) {
    const readyBatch = selectReadyBatch([...pendingCalls.values()], completedIndexes);
    if (readyBatch.length === 0) {
      throw new Error(
        `Unable to resolve tool execution order. Unresolved calls: ${unresolvedCallsDebugString(
          [...pendingCalls.values()],
          completedIndexes
        )}`
      );
    }

    if (readyBatch.length > 1) {
      const parallelTools = readyBatch
        .map(call => `${call.toolCall.name}#${call.index}`)
        .join(', ');
      logger.log(`AiAssistantTools | Run in parallel: ${parallelTools}`);
    }

    const settledBatch = await Promise.allSettled(
      readyBatch.map(async scheduled => {
        const toolResult = await toolRegistry.executeToToolMessage(
          scheduled.toolCall.name,
          scheduled.argsJson,
          context
        );
        return {
          scheduled,
          status: 'success' as const,
          toolResult,
        };
      })
    );

    const executedResults: ExecutedToolCallResult[] = settledBatch.map((result, index) => {
      const scheduled = readyBatch[index];
      if (result.status === 'fulfilled') {
        return result.value;
      }

      return {
        scheduled,
        status: 'error',
        error: castError(result.reason),
      };
    });

    executedResults.sort((left, right) => left.scheduled.index - right.scheduled.index);

    for (const execution of executedResults) {
      const { scheduled } = execution;
      const { toolCall, argsJson } = scheduled;

      if (execution.status === 'success' && execution.toolResult) {
        const toolResult = execution.toolResult;

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

        logger.log(`AiAssistantTools | Executed tool: ${toolCall.name}`, { arguments: argsJson });

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
      } else {
        const errorMessage = execution.error?.message ?? 'Unknown tool execution error';

        telemetry.toolCalls.push({
          turn: telemetry.llmCalls.length - 1,
          name: toolCall.name,
          argsJson,
          success: false,
          errorMessage,
        });
        logger.warn(`Tool execution failed for ${toolCall.name}`, {
          stack: execution.error?.stack,
        });

        messages.push({
          role: AiRole.TOOL,
          toolName: toolCall.name,
          callId: toolCall.id,
          content: `Tool ${toolCall.name} failed with error: ${errorMessage}. Please adjust and try again.`,
        });
        telemetry.messageHistory.push(messages[messages.length - 1]);
      }

      completedIndexes.add(scheduled.index);
      pendingCalls.delete(scheduled.index);
    }
  }
}
