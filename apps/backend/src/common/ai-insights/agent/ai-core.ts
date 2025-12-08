// Domain-level neutral AI chat types and provider interface
// These types decouple the agent from any specific LLM vendor wire format.

export enum AiRole {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant',
  TOOL = 'tool',
}

export type AiToolCall = {
  id: string;
  name: string;
  argumentsJson: string;
};

export type AiAssistantMessage = {
  role: AiRole.ASSISTANT;
  content?: string;
  toolCalls?: AiToolCall[];
};

export type AiMessage =
  | { role: AiRole.SYSTEM | AiRole.USER; content: string }
  | AiAssistantMessage
  | { role: AiRole.TOOL; toolName: string; callId: string; content: string };

export type AiToolDefinition = {
  name: string;
  description?: string;
  inputJsonSchema: Record<string, unknown>;
};

export type AiToolMode = 'auto' | 'required' | 'none' | { type: 'function'; names: string[] };

export type AiUsage = {
  executionTime: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export type AiFinishReason = string | undefined;

export type AiChatRequest = {
  messages: AiMessage[];
  tools?: AiToolDefinition[];
  toolMode?: AiToolMode;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: {
    type: 'json_object';
    schema?: unknown;
  };
};

export type AiChatResponse = {
  message: AiAssistantMessage;
  usage: AiUsage;
  finishReason?: AiFinishReason;
  model?: string;
};

export interface AiChatProvider {
  chat(request: AiChatRequest): Promise<AiChatResponse>;
}
