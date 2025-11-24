import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff } from '@owox/internal-helpers';
import {
  AiChatProvider,
  AiChatRequest,
  AiChatResponse,
  AiAssistantMessage,
  AiRole,
} from '../../agent/ai-core';
import {
  extractReasoning,
  extractUsage,
  mapDomainMessageToOpenAi,
  mapNormalizedToolCallsToAiToolCalls,
  mapUsageToDomain,
  normalizeToolCallsFromCommentary,
  normalizeToolCallsFromFunctionCall,
  normalizeToolCallsFromToolCalls,
} from './openai.mapper';
import { RawResponse } from './types';

/**
 * OpenAI-specific adapter that maps our domain-level request/response
 */
@Injectable()
export class OpenAiChatProvider implements AiChatProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('AI_BASE_URL', '')!.replace(/\/$/, '');
    this.apiKey = this.config.get<string>('AI_API_KEY', '')!;
    this.model = this.config.get<string>('AI_MODEL', '')!;
  }

  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    if (!this.baseUrl || !this.apiKey || !this.model) {
      throw new Error('AI client is not configured');
    }

    const body = {
      model: this.model,
      messages: request.messages.map(m => mapDomainMessageToOpenAi(m)),
      temperature: request.temperature ?? 0.1,
      max_tokens: request.maxTokens ?? 5000,
      tools: request.tools?.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputJsonSchema,
        },
      })),
      tool_choice: request.toolMode ?? 'auto',
    };

    const res = await fetchWithBackoff(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI chat failed: ${res.status} ${res.statusText} ${text}`);
    }

    const data: RawResponse = await res.json();
    const choice = data.choices?.[0];
    if (!choice || !choice.message) {
      throw new Error('AI returned no message');
    }

    const msg = choice.message;
    const content = typeof msg.content === 'string' ? msg.content : undefined;

    const normalizedToolCalls =
      normalizeToolCallsFromToolCalls(msg) ??
      normalizeToolCallsFromFunctionCall(msg) ??
      normalizeToolCallsFromCommentary(content);

    const toolCalls = mapNormalizedToolCallsToAiToolCalls(normalizedToolCalls);

    const reasoning = extractReasoning(data, msg);
    const usage = extractUsage(data);

    const assistant: AiAssistantMessage = { role: AiRole.ASSISTANT, content, toolCalls };

    return {
      message: assistant,
      usage: mapUsageToDomain(usage),
      finishReason: reasoning,
      model: this.model,
    };
  }
}
