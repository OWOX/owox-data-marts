export type ToolSchema = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

export type NormalizedToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content?: string; tool_calls?: NormalizedToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface CreateChatCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: ToolSchema[];
  tool_choice?: 'auto' | { type: 'function'; function: { name: string } };
}

export interface AssistantMessage {
  role: 'assistant';
  content?: string;
  tool_calls?: NormalizedToolCall[];
  reasoning?: string;
  usage?: UsageInfo;
  model?: string;
}

export interface UsageInfo {
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
  total_tokens?: number;
}

interface RawToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: unknown };
}

export interface RawFunctionCall {
  name?: string;
  arguments?: unknown;
}

export interface RawMessage {
  role?: string;
  content?: string | null;
  tool_calls?: RawToolCall[];
  function_call?: RawFunctionCall;
  reasoning_content?: string;
  reasoning?: string;
}

export interface RawChoice {
  message?: RawMessage;
}

export interface RawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
  total_tokens?: number;
}

export interface RawResponse {
  choices?: RawChoice[];
  usage?: RawUsage;
  output?: { reasoning?: string };
  reasoning?: string;
}

export interface LlmCallTelemetry {
  turn: number;
  model?: string;
  finishReason?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
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
}

export interface AiContext {
  telemetry?: AgentTelemetry;
}

export interface AgentBudgets {
  maxRows?: number;
  maxBytesProcessed?: number;
}
