import { z } from 'zod';
import { getPromptTotalUsage, ModelUsageTotals } from '../utils/compute-model-usage';
import { AgentTelemetry } from '../../../common/ai-insights/agent/types';
import { PromptSanitizeResult } from '../../../common/ai-insights/services/prompt-sanitizer.service';
import { AiRole } from '../../../common/ai-insights/agent/ai-core';

const AiUsageSchema = z
  .object({
    executionTime: z.number(),
    promptTokens: z.number(),
    completionTokens: z.number(),
    reasoningTokens: z.number(),
    totalTokens: z.number(),
  })
  .passthrough();

const LlmCallTelemetrySchema = z
  .object({
    turn: z.number(),
    model: z.string().optional(),
    finishReason: z.string().optional(),
    usage: AiUsageSchema,
    reasoningPreview: z.string().optional(),
  })
  .passthrough();

const ToolCallTelemetrySchema = z
  .object({
    turn: z.number(),
    name: z.string(),
    argsJson: z.string(),
    success: z.boolean(),
    toolResult: z.unknown().optional(),
    errorMessage: z.string().optional(),
  })
  .passthrough();

const AiToolCallSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    argumentsJson: z.string(),
  })
  .passthrough();

const AiMessageSchema = z.union([
  z
    .object({
      role: z.enum([AiRole.SYSTEM, AiRole.USER]),
      content: z.string(),
    })
    .passthrough(),
  z
    .object({
      role: z.literal(AiRole.ASSISTANT),
      content: z.string().optional(),
      toolCalls: z.array(AiToolCallSchema).optional(),
    })
    .passthrough(),
  z
    .object({
      role: z.literal(AiRole.TOOL),
      toolName: z.string(),
      callId: z.string(),
      content: z.string(),
    })
    .passthrough(),
]);

const AgentTelemetrySchema: z.ZodType<AgentTelemetry> = z
  .object({
    llmCalls: z.array(LlmCallTelemetrySchema),
    toolCalls: z.array(ToolCallTelemetrySchema),
    messageHistory: z.array(AiMessageSchema),
  })
  .passthrough();

export function createTelemetry(): AgentTelemetry {
  return {
    llmCalls: [],
    toolCalls: [],
    messageHistory: [],
  };
}

export function appendSanitizeTelemetry(
  telemetry: AgentTelemetry,
  sanitizeResult: PromptSanitizeResult | null
): void {
  if (!sanitizeResult?.usage) {
    return;
  }

  telemetry.llmCalls.push({
    turn: 0,
    model: sanitizeResult.model,
    finishReason: sanitizeResult.finishReason,
    usage: sanitizeResult.usage,
    reasoningPreview: 'prompt_sanitizer',
  });
}

export function mergeTelemetry(target: AgentTelemetry, source?: AgentTelemetry): void {
  if (!source) {
    return;
  }

  target.llmCalls.push(...source.llmCalls);
  target.toolCalls.push(...source.toolCalls);
  target.messageHistory.push(...source.messageHistory);
}

export function summarizeAgentTelemetry(telemetry: AgentTelemetry): {
  llmCalls: number;
  toolCalls: number;
  failedToolCalls: number;
  lastFinishReason?: string;
  totalUsage: ModelUsageTotals;
} {
  const llmCalls = telemetry.llmCalls ?? [];
  const toolCalls = telemetry.toolCalls ?? [];
  const failedToolCalls = toolCalls.filter(call => !call.success).length;
  const lastLlm = llmCalls.length ? llmCalls[llmCalls.length - 1] : undefined;
  return {
    llmCalls: llmCalls.length,
    toolCalls: toolCalls.length,
    failedToolCalls,
    lastFinishReason: lastLlm?.finishReason,
    totalUsage: getPromptTotalUsage(llmCalls),
  };
}

export function normalizeAgentTelemetry(value: unknown): AgentTelemetry {
  const parsed = AgentTelemetrySchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  return createTelemetry();
}

export function appendNormalizedTelemetry(
  target: AgentTelemetry | undefined,
  source: unknown
): void {
  if (!target) {
    return;
  }

  mergeTelemetry(target, normalizeAgentTelemetry(source));
}
