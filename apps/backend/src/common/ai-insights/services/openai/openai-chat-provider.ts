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
  normalizeToolCallsFromBracketSyntax,
  normalizeToolCallsFromCommentary,
  normalizeToolCallsFromDeepSeekFormat,
  normalizeToolCallsFromFunctionCall,
  normalizeToolCallsFromToolCalls,
} from './openai.mapper';
import { RawResponse } from './types';
import {
  AiChatHttpError,
  AiContentFilterError,
  ErrorEnvelopeSchema,
  ErrorPayload,
  ErrorPayloadSchema,
} from '../error';

/**
 * OpenAI-specific adapter that maps our domain-level request/response
 */
@Injectable()
export class OpenAiChatProvider implements AiChatProvider {
  protected readonly requestTimeout = 60 * 10 * 1000; // 10 minutes

  protected readonly baseUrl: string;
  protected readonly apiKey: string;
  protected readonly model: string;

  constructor(protected readonly config: ConfigService) {
    this.baseUrl = this.getBaseUrl();
    this.apiKey = this.config.get<string>('AI_API_KEY', '')!;
    this.model = this.config.get<string>('AI_MODEL', '')!;
  }

  /**
   * Hook method to get the base URL for the AI provider.
   * Can be overridden by subclasses to provide a fixed URL.
   */
  protected getBaseUrl(): string {
    return this.config.get<string>('AI_BASE_URL', '')!.replace(/\/$/, '');
  }

  /**
   * Hook method to add provider-specific fields to the request body.
   * Can be overridden by subclasses to add custom fields.
   */
  protected getProviderSpecificFields(): Record<string, unknown> {
    return {};
  }

  /**
   * Hook method to get the provider name for error messages.
   * Can be overridden by subclasses to provide a specific name.
   */
  protected getProviderName(): string {
    return 'AI';
  }

  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    if (!this.baseUrl || !this.apiKey || !this.model) {
      throw new Error(
        `${this.getProviderName()} client is not configured. Please set required environment variables.`
      );
    }

    return this.executeChat(request);
  }

  private async executeChat(request: AiChatRequest): Promise<AiChatResponse> {
    const body = this.buildRequestBody(request);

    const start = performance.now();
    const res = await fetchWithBackoff(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      },
      this.requestTimeout
    );
    const end = performance.now();
    const executionMs = end - start;

    if (!res.ok) {
      const text = await res.text();
      if (this.isContentFilterResponse(res.status, text)) {
        throw new AiContentFilterError(this.getProviderName(), res.status, text);
      }
      throw new AiChatHttpError(this.getProviderName(), res.status, res.statusText, text);
    }

    const data: RawResponse = await res.json();
    const choice = data.choices?.[0];
    if (!choice || !choice.message) {
      throw new Error(`${this.getProviderName()} returned no message`);
    }

    const msg = choice.message;
    const content = typeof msg.content === 'string' ? msg.content : undefined;

    const normalizedToolCalls =
      normalizeToolCallsFromToolCalls(msg) ??
      normalizeToolCallsFromFunctionCall(msg) ??
      normalizeToolCallsFromDeepSeekFormat(content) ??
      normalizeToolCallsFromCommentary(content) ??
      normalizeToolCallsFromBracketSyntax(content);

    const toolCalls = mapNormalizedToolCallsToAiToolCalls(normalizedToolCalls);

    const reasoning = extractReasoning(data, msg);
    const usage = extractUsage(data);

    const assistant: AiAssistantMessage = { role: AiRole.ASSISTANT, content, toolCalls };

    return {
      message: assistant,
      usage: mapUsageToDomain(executionMs, usage),
      finishReason: reasoning,
      model: this.model,
    };
  }

  private buildRequestBody(request: AiChatRequest): Record<string, unknown> {
    return {
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
      response_format: request.responseFormat,
      // Add provider-specific fields
      ...this.getProviderSpecificFields(),
    };
  }

  private isContentFilterResponse(status: number, body: string): boolean {
    if (!body || (status !== 400 && status !== 403)) {
      return false;
    }

    const parsed = this.safeJsonParse(body);
    const errorPayload = this.extractErrorPayload(parsed);
    return errorPayload?.innererror?.code === 'ResponsibleAIPolicyViolation';
  }

  private extractErrorPayload(parsed: unknown): ErrorPayload | undefined {
    if (!parsed || typeof parsed !== 'object') {
      return undefined;
    }

    const envelope = ErrorEnvelopeSchema.safeParse(parsed);
    if (envelope.success) {
      return envelope.data.error;
    }

    const payload = ErrorPayloadSchema.safeParse(parsed);
    if (payload.success) {
      return payload.data;
    }

    return undefined;
  }

  private safeJsonParse(value: string): unknown | undefined {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
}
