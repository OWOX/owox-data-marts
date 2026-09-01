import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type {
  EmbeddingModelV4,
  EmbeddingModelV4CallOptions,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import type { CredentialFetchRequestApiDto } from '../dto/credential-fetch-api.dto';
import type {
  CredentialAiEmbeddingModelKey,
  CredentialAiLanguageModelKey,
} from '../dto/credential-ai-api.dto';
import type { ResolvedCredentialBinding } from '../facades/credential-consumer-binding.facade';
import {
  decodeCredentialAiOptions,
  sanitizeCredentialAiEmbeddingResult,
  sanitizeCredentialAiGenerateResult,
  sanitizeCredentialAiStreamPart,
} from './credential-ai-portable';
import { CredentialFetchService } from './credential-fetch.service';

const PROVIDER_KEY_PLACEHOLDER = 'owox-host-injected';
const AI_TIMEOUT_MS = 120_000;
const AI_MAX_RESPONSE_BODY_BYTES = 10 * 1024 * 1024;

@Injectable()
export class CredentialAiService {
  constructor(private readonly credentialFetch: CredentialFetchService) {}

  async generate(
    binding: ResolvedCredentialBinding,
    modelKey: CredentialAiLanguageModelKey,
    portableOptions: unknown,
    signal: AbortSignal
  ): Promise<unknown> {
    try {
      const model = this.createLanguageModel(binding, modelKey, signal);
      const options = decodeCredentialAiOptions(
        portableOptions,
        signal
      ) as LanguageModelV4CallOptions;
      const result = await model.doGenerate(options);
      return sanitizeCredentialAiGenerateResult(result);
    } catch (error) {
      throw normalizeAiError(error);
    }
  }

  async stream(
    binding: ResolvedCredentialBinding,
    modelKey: CredentialAiLanguageModelKey,
    portableOptions: unknown,
    signal: AbortSignal
  ): Promise<ReadableStream<unknown>> {
    try {
      const model = this.createLanguageModel(binding, modelKey, signal);
      const options = decodeCredentialAiOptions(
        portableOptions,
        signal
      ) as LanguageModelV4CallOptions;
      const result = await model.doStream(options);
      return sanitizeAiStream(result.stream);
    } catch (error) {
      throw normalizeAiError(error);
    }
  }

  async embed(
    binding: ResolvedCredentialBinding,
    modelKey: CredentialAiEmbeddingModelKey,
    portableOptions: unknown,
    signal: AbortSignal
  ): Promise<unknown> {
    try {
      const model = this.createEmbeddingModel(binding, modelKey, signal);
      const options = decodeCredentialAiOptions(
        portableOptions,
        signal
      ) as EmbeddingModelV4CallOptions;
      const result = await model.doEmbed(options);
      return sanitizeCredentialAiEmbeddingResult(result);
    } catch (error) {
      throw normalizeAiError(error);
    }
  }

  private createLanguageModel(
    binding: ResolvedCredentialBinding,
    modelKey: CredentialAiLanguageModelKey,
    signal: AbortSignal
  ): LanguageModelV4 {
    const ai = binding.definition.ai;
    if (!ai) throw new BadRequestException('The selected Credential is not an AI Credential');
    const modelId = requiredModelId(binding, modelKey);
    const trustedFetch = this.createTrustedFetch(binding, signal);

    switch (ai.adapter) {
      case 'openai':
        return createOpenAI({
          apiKey: PROVIDER_KEY_PLACEHOLDER,
          baseURL: ai.baseUrl,
          fetch: trustedFetch,
        }).chat(modelId);
      case 'anthropic':
        return createAnthropic({
          apiKey: PROVIDER_KEY_PLACEHOLDER,
          baseURL: ai.baseUrl,
          fetch: trustedFetch,
        }).chat(modelId);
      case 'google':
        return createGoogle({
          apiKey: PROVIDER_KEY_PLACEHOLDER,
          baseURL: ai.baseUrl,
          fetch: trustedFetch,
        }).chat(modelId);
      case 'openrouter':
      case 'openai-compatible':
        return createOpenAICompatible({
          name: `owox-${ai.adapter}`,
          apiKey: PROVIDER_KEY_PLACEHOLDER,
          baseURL: ai.baseUrl,
          fetch: trustedFetch,
        }).chatModel(modelId);
    }
  }

  private createEmbeddingModel(
    binding: ResolvedCredentialBinding,
    modelKey: CredentialAiEmbeddingModelKey,
    signal: AbortSignal
  ): EmbeddingModelV4 {
    const ai = binding.definition.ai;
    if (!ai) throw new BadRequestException('The selected Credential is not an AI Credential');
    const modelId = requiredModelId(binding, modelKey);
    const trustedFetch = this.createTrustedFetch(binding, signal);

    switch (ai.adapter) {
      case 'openai':
        return createOpenAI({
          apiKey: PROVIDER_KEY_PLACEHOLDER,
          baseURL: ai.baseUrl,
          fetch: trustedFetch,
        }).embeddingModel(modelId);
      case 'google':
        return createGoogle({
          apiKey: PROVIDER_KEY_PLACEHOLDER,
          baseURL: ai.baseUrl,
          fetch: trustedFetch,
        }).embeddingModel(modelId);
      case 'openrouter':
      case 'openai-compatible':
        return createOpenAICompatible({
          name: `owox-${ai.adapter}`,
          apiKey: PROVIDER_KEY_PLACEHOLDER,
          baseURL: ai.baseUrl,
          fetch: trustedFetch,
        }).embeddingModel(modelId);
      case 'anthropic':
        throw new BadRequestException('Anthropic Credentials do not support embedding models');
    }
  }

  private createTrustedFetch(
    binding: ResolvedCredentialBinding,
    outerSignal: AbortSignal
  ): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = new Request(input, init);
      const signal = request.signal ? AbortSignal.any([outerSignal, request.signal]) : outerSignal;
      const method = request.method.toUpperCase();
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(method)) {
        throw new BadRequestException('AI provider request method is not allowed');
      }
      const headers: Record<string, string> = {};
      request.headers.forEach((value, name) => {
        headers[name] = value;
      });
      const body =
        method === 'GET' || method === 'HEAD'
          ? undefined
          : Buffer.from(await request.arrayBuffer()).toString('base64');
      const fetchInput: CredentialFetchRequestApiDto = {
        url: request.url,
        method: method as CredentialFetchRequestApiDto['method'],
        headers,
        ...(body ? { bodyBase64: body } : {}),
      };
      return this.credentialFetch.runRaw(binding, fetchInput, {
        signal,
        timeoutMs: AI_TIMEOUT_MS,
        maxResponseBodyBytes: AI_MAX_RESPONSE_BODY_BYTES,
      });
    }) as typeof fetch;
  }
}

function requiredModelId(
  binding: ResolvedCredentialBinding,
  modelKey: CredentialAiLanguageModelKey | CredentialAiEmbeddingModelKey
): string {
  const modelId = binding.aiModelMappings?.[modelKey]?.trim();
  if (!modelId) throw new BadRequestException(`AI model mapping ${modelKey} is not configured`);
  return modelId;
}

function sanitizeAiStream(
  source: ReadableStream<LanguageModelV4StreamPart>
): ReadableStream<unknown> {
  const reader = source.getReader();
  return new ReadableStream<unknown>({
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          const sanitized = sanitizeCredentialAiStreamPart(value);
          if (sanitized !== null) {
            controller.enqueue(sanitized);
            return;
          }
        }
      } catch {
        controller.enqueue({
          type: 'error',
          error: { name: 'Error', message: 'AI provider request failed' },
        });
        controller.close();
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

function normalizeAiError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  return new BadGatewayException('AI provider request could not be completed');
}
