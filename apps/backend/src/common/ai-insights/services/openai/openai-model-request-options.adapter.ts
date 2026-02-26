import { AiChatRequest } from '../../agent/ai-core';

export type OpenAiModelRequestOptionsAdapter = {
  modelNames: string[];
  buildFields: (request: AiChatRequest) => Record<string, unknown>;
};

export const GPT5_CHAT_COMPLETIONS_MODEL_OPTIONS_ADAPTER: OpenAiModelRequestOptionsAdapter = {
  modelNames: ['gpt-5.1', 'gpt-5.1-chat', 'gpt-5.2', 'gpt-5.2-chat'],
  buildFields: (request: AiChatRequest) => ({
    // GPT-5.x chat-completions variants require max_completion_tokens and reject temperature < 1.
    temperature: 1,
    max_completion_tokens: request.maxTokens ?? 5000,
  }),
};
