export type NormalizedToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export interface UsageInfo {
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
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
