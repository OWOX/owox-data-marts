import { z, ZodTypeAny } from 'zod';
import { AiChatProvider, AiMessage } from './ai-core';
import { Logger } from '@nestjs/common';
import { ToolRegistry } from './tool-registry';

export type ToolDefinition = {
  name: string;
  description?: string;
  inputJsonSchema: Record<string, unknown>;
  inputZod: z.ZodType<unknown>;
  execute: (args: unknown, context: AiContext) => Promise<unknown>;
  isFinal: boolean;
};

export type ToolRunResult = {
  name: string;
  content: unknown;
};

export type ToolNameBase = string;

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
  toolResult?: unknown;
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

export type ToolMessageProcessor = (params: {
  toolName: string;
  toolResult: ToolRunResult;
  argsJson: string;
  context: AiContext;
  messages: AiMessage[];
}) => string;

export interface ToolLoopOptions {
  aiProvider: AiChatProvider;
  toolRegistry: ToolRegistry;
  context: AiContext;
  telemetry: AgentTelemetry;
  initialMessages: AiMessage[];
  tools: ReturnType<ToolRegistry['getAiTools']>;
  maxTurns: number;
  resultSchema: ZodTypeAny;
  logger: Logger;
  messageProcessors?: Record<string, ToolMessageProcessor>;
  temperature?: number;
  maxTokens?: number;
}

export interface ToolExecutionRecord {
  name: string;
  callId: string;
  argsJson: string;
  result: ToolRunResult;
}

export interface ToolLoopOutput<TResult> {
  result: TResult;
  messages: AiMessage[];
  toolExecutions: ToolExecutionRecord[];
}
