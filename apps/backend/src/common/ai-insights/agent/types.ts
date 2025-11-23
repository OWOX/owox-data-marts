import { z } from 'zod';
import { AiMessage } from './ai-core';

export type ToolDefinition = {
  name: string;
  description?: string;
  inputJsonSchema: Record<string, unknown>;
  inputZod: z.ZodType<unknown>;
  execute: (args: unknown, context: AiContext) => Promise<unknown>;
  isFinal: boolean;
};

export type ToolRunResult<TFinal> =
  | { isFinal: true; content: TFinal }
  | { isFinal: false; content: unknown };

export interface LlmCallTelemetry {
  turn: number;
  model?: string;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  reasoningPreview?: string;
}

export interface ToolCallTelemetry {
  turn: number;
  name: string;
  argsJson: string;
  success: boolean;
  errorMessage?: string;
}

export interface AgentTelemetry {
  llmCalls: LlmCallTelemetry[];
  toolCalls: ToolCallTelemetry[];
  messageHistory: AiMessage[];
}

export interface AiContext {
  telemetry?: AgentTelemetry;
}

export interface AgentBudgets {
  maxRows?: number;
  maxBytesProcessed?: number;
}
