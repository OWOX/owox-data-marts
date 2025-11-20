import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff } from '@owox/internal-helpers';
import {
  AssistantMessage,
  ChatMessage,
  CreateChatCompletionOptions,
  NormalizedToolCall,
  RawMessage,
  RawResponse,
  UsageInfo,
} from '../../agent/types';

@Injectable()
export class OpenAiToolCallingClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('AI_BASE_URL', '')!.replace(/\/$/, '');
    this.apiKey = this.config.get<string>('AI_API_KEY', '')!;
    this.model = this.config.get<string>('AI_MODEL', '')!;
  }

  async createChatCompletion(
    messages: ChatMessage[],
    opts?: CreateChatCompletionOptions
  ): Promise<AssistantMessage> {
    if (!this.baseUrl || !this.apiKey || !this.model) {
      throw new Error('AI client is not configured');
    }

    const requestBody = {
      model: this.model,
      messages,
      temperature: opts?.temperature ?? 0.1,
      max_tokens: opts?.maxTokens ?? 1000,
      tools: opts?.tools?.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      })),
      tool_choice: opts?.tool_choice ?? 'auto',
    };

    const res = await fetchWithBackoff(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI tool calling failed: ${res.status} ${res.statusText} ${text}`);
    }

    const data: RawResponse = await res.json();
    const choice = data.choices?.[0];
    if (!choice || !choice.message) {
      throw new Error('AI returned no message');
    }

    const message = choice.message;
    const content = typeof message.content === 'string' ? message.content : undefined;

    const toolCalls =
      this.normalizeToolCallsFromToolCalls(message) ??
      this.normalizeToolCallsFromFunctionCall(message) ??
      this.normalizeToolCallsFromCommentary(content);

    const reasoning = this.extractReasoning(data, message);
    const usage = this.extractUsage(data);

    return {
      role: 'assistant',
      content,
      tool_calls: toolCalls,
      reasoning,
      usage,
      model: this.model,
    };
  }

  private normalizeToolCallsFromToolCalls(message: RawMessage): NormalizedToolCall[] | undefined {
    if (!Array.isArray(message.tool_calls) || message.tool_calls.length === 0) {
      return undefined;
    }

    const normalized = message.tool_calls
      .map((tc): NormalizedToolCall | null => {
        const fnName = tc.function?.name ?? '';
        if (!fnName) return null;

        const id = tc.id ?? '';
        const rawArgs = tc.function?.arguments;
        const args = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs ?? {});

        return {
          id,
          type: 'function',
          function: { name: fnName, arguments: args },
        };
      })
      .filter((tc): tc is NormalizedToolCall => tc !== null);

    return normalized.length > 0 ? normalized : undefined;
  }

  private normalizeToolCallsFromFunctionCall(
    message: RawMessage
  ): NormalizedToolCall[] | undefined {
    const fc = message.function_call;
    if (!fc || !fc.name) {
      return undefined;
    }

    const args =
      typeof fc.arguments === 'string' ? fc.arguments : JSON.stringify(fc.arguments ?? {});

    return [
      {
        id: '',
        type: 'function',
        function: { name: fc.name, arguments: args },
      },
    ];
  }

  private normalizeToolCallsFromCommentary(content?: string): NormalizedToolCall[] | undefined {
    if (!content) return undefined;

    const regex = /to=functions\.([\w.-]+)[\s\S]*?<\|message\|>(\{[\s\S]*?})<\|call\|>/m;

    const match = content.match(regex);
    if (!match) return undefined;

    const fnName = match[1];
    const args = match[2];

    return [
      {
        id: '',
        type: 'function',
        function: { name: fnName, arguments: args },
      },
    ];
  }

  private extractReasoning(data: RawResponse, message: RawMessage): string | undefined {
    return (
      message.reasoning_content || message.reasoning || data.reasoning || data.output?.reasoning
    );
  }

  private extractUsage(data: RawResponse): UsageInfo | undefined {
    const usage = data.usage;
    if (!usage) return undefined;

    return {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      reasoning_tokens: usage.reasoning_tokens,
      total_tokens: usage.total_tokens,
    };
  }
}
