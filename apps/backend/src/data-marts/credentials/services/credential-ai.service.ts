import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  APICallError,
  Experimental_DecisionUnsupportedQuestionTypeError,
  type Experimental_DecisionModelV4,
  type Experimental_DecisionModelV4CallOptions,
  type EmbeddingModelV4,
  type EmbeddingModelV4CallOptions,
  type LanguageModelV4,
  type LanguageModelV4CallOptions,
  type LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import type { CredentialFetchRequestApiDto } from '../dto/credential-fetch-api.dto';
import type {
  CredentialAiDecisionModelKey,
  CredentialAiEmbeddingModelKey,
  CredentialAiLanguageModelKey,
} from '../dto/credential-ai-api.dto';
import type { ResolvedCredentialBinding } from '../facades/credential-consumer-binding.facade';
import { BUILTIN_CREDENTIAL_DEFINITION_IDS } from './builtin-credential-definitions';
import {
  decodeCredentialAiOptions,
  sanitizeCredentialAiDecisionResult,
  sanitizeCredentialAiEmbeddingResult,
  sanitizeCredentialAiGenerateResult,
  sanitizeCredentialAiStreamPart,
} from './credential-ai-portable';
import { CredentialFetchService } from './credential-fetch.service';

const PROVIDER_KEY_PLACEHOLDER = 'owox-host-injected';
export const AI_TIMEOUT_MS = 120_000;
export const AI_MAX_RESPONSE_BODY_BYTES = 10 * 1024 * 1024;
/** A provider's error message is third-party text; a log line keeps only its start. */
const MAX_LOGGED_PROVIDER_MESSAGE = 500;
/** Shorter secret parts (a provider name, a flag) would redact ordinary words. */
const MIN_REDACTED_SECRET_LENGTH = 8;

/**
 * What the log line of a failed AI call names, and what it must not show. A trusted provider is
 * built in: its error message may be logged, with the secret cut out.
 */
export interface AiFailureLog {
  subject: string;
  secret: unknown;
  trustedProvider: boolean;
}

@Injectable()
export class CredentialAiService {
  private readonly logger = new Logger(CredentialAiService.name);

  constructor(private readonly credentialFetch: CredentialFetchService) {}

  async generate(
    binding: ResolvedCredentialBinding,
    modelKey: CredentialAiLanguageModelKey,
    portableOptions: unknown,
    signal: AbortSignal
  ): Promise<unknown> {
    return this.generateWith(
      this.createLanguageModel(binding, modelKey, signal),
      portableOptions,
      signal,
      credentialFailureLog(binding, modelKey)
    );
  }

  async stream(
    binding: ResolvedCredentialBinding,
    modelKey: CredentialAiLanguageModelKey,
    portableOptions: unknown,
    signal: AbortSignal
  ): Promise<ReadableStream<unknown>> {
    return this.streamWith(
      this.createLanguageModel(binding, modelKey, signal),
      portableOptions,
      signal,
      credentialFailureLog(binding, modelKey)
    );
  }

  async embed(
    binding: ResolvedCredentialBinding,
    modelKey: CredentialAiEmbeddingModelKey,
    portableOptions: unknown,
    signal: AbortSignal
  ): Promise<unknown> {
    return this.embedWith(
      this.createEmbeddingModel(binding, modelKey, signal),
      portableOptions,
      signal,
      credentialFailureLog(binding, modelKey)
    );
  }

  async decide(
    binding: ResolvedCredentialBinding,
    modelKey: CredentialAiDecisionModelKey,
    portableOptions: unknown,
    signal: AbortSignal
  ): Promise<unknown> {
    return this.decideWith(
      this.createDecisionModel(binding, modelKey, signal),
      portableOptions,
      signal,
      credentialFailureLog(binding, modelKey)
    );
  }

  async generateWith(
    model: LanguageModelV4,
    portableOptions: unknown,
    signal: AbortSignal,
    failureLog: AiFailureLog
  ): Promise<unknown> {
    try {
      const options = decodeCredentialAiOptions(
        portableOptions,
        signal
      ) as LanguageModelV4CallOptions;
      const result = await model.doGenerate(options);
      return sanitizeCredentialAiGenerateResult(result);
    } catch (error) {
      throw this.normalizeError(error, failureLog);
    }
  }

  async streamWith(
    model: LanguageModelV4,
    portableOptions: unknown,
    signal: AbortSignal,
    failureLog: AiFailureLog
  ): Promise<ReadableStream<unknown>> {
    try {
      const options = decodeCredentialAiOptions(
        portableOptions,
        signal
      ) as LanguageModelV4CallOptions;
      const result = await model.doStream(options);
      return sanitizeAiStream(result.stream);
    } catch (error) {
      throw this.normalizeError(error, failureLog);
    }
  }

  async embedWith(
    model: EmbeddingModelV4,
    portableOptions: unknown,
    signal: AbortSignal,
    failureLog: AiFailureLog
  ): Promise<unknown> {
    try {
      const options = decodeCredentialAiOptions(
        portableOptions,
        signal
      ) as EmbeddingModelV4CallOptions;
      const result = await model.doEmbed(options);
      return sanitizeCredentialAiEmbeddingResult(result);
    } catch (error) {
      throw this.normalizeError(error, failureLog);
    }
  }

  async decideWith(
    model: Experimental_DecisionModelV4,
    portableOptions: unknown,
    signal: AbortSignal,
    failureLog: AiFailureLog
  ): Promise<unknown> {
    try {
      const options = decodeCredentialAiOptions(
        portableOptions,
        signal
      ) as Experimental_DecisionModelV4CallOptions;
      for (const [id, question] of Object.entries(options.questions ?? {})) {
        if (!model.supportedQuestionTypes.includes(question.type)) {
          throw unsupportedQuestionType(id, question.type);
        }
      }
      const result = await model.doDecide(options);
      return sanitizeCredentialAiDecisionResult(result);
    } catch (error) {
      if (Experimental_DecisionUnsupportedQuestionTypeError.isInstance(error)) {
        throw unsupportedQuestionType(error.questionId, error.questionType);
      }
      throw this.normalizeError(error, failureLog);
    }
  }

  private normalizeError(error: unknown, failureLog: AiFailureLog): HttpException {
    // Our own refusals (not an AI Credential, no model mapped) reach the plugin as they are.
    if (error instanceof HttpException && error.getStatus() < 500) return error;
    this.logger.warn(
      `AI provider request failed for ${failureLog.subject}${failureDetail(error, failureLog)}`
    );
    return new BadGatewayException('AI provider request could not be completed');
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

  private createDecisionModel(
    binding: ResolvedCredentialBinding,
    modelKey: CredentialAiDecisionModelKey,
    signal: AbortSignal
  ): Experimental_DecisionModelV4 {
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
        }).decisionModel(modelId);
      case 'anthropic':
        return createAnthropic({
          apiKey: PROVIDER_KEY_PLACEHOLDER,
          baseURL: ai.baseUrl,
          fetch: trustedFetch,
        }).decisionModel(modelId);
      case 'google':
        return createGoogle({
          apiKey: PROVIDER_KEY_PLACEHOLDER,
          baseURL: ai.baseUrl,
          fetch: trustedFetch,
        }).decisionModel(modelId);
      case 'openrouter':
      case 'openai-compatible':
        throw new BadRequestException(`${ai.adapter} Credentials do not support decision models`);
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

/**
 * What a log line may say about a failed AI call. Never the error object: it carries the
 * prompt. Only a built-in provider's HTTP answer gives its message, with the secret cut out.
 * Any other server is third-party code that may echo the request or the key back, and other
 * AI SDK errors put the model's output in theirs, so those give a name only.
 */
function failureDetail(error: unknown, failureLog: AiFailureLog): string {
  // A timeout or a refused connection, worded by the guarded fetch itself.
  if (error instanceof HttpException) return `: ${error.message}`;
  if (!APICallError.isInstance(error)) return `: ${castError(error).name}`;
  const status = error.statusCode ? ` (HTTP ${error.statusCode})` : '';
  if (!failureLog.trustedProvider) return `${status}: ${error.name}`;
  return `${status}: ${redactSecret(error.message, failureLog.secret).slice(0, MAX_LOGGED_PROVIDER_MESSAGE)}`;
}

function credentialFailureLog(
  binding: ResolvedCredentialBinding,
  modelKey:
    | CredentialAiLanguageModelKey
    | CredentialAiEmbeddingModelKey
    | CredentialAiDecisionModelKey
): AiFailureLog {
  return {
    subject: `Credential ${binding.credentialId}, model ${modelKey}`,
    secret: binding.secret,
    trustedProvider: BUILTIN_CREDENTIAL_DEFINITION_IDS.has(binding.definition.id),
  };
}

function unsupportedQuestionType(id: string, type: string): BadRequestException {
  return new BadRequestException(
    `Decision question ${id} has the type ${type}, which this AI model does not support`
  );
}

function redactSecret(text: string, secret: unknown): string {
  return secretStrings(secret).reduce(
    (redacted, part) => redacted.split(part).join('[redacted]'),
    text
  );
}

function secretStrings(value: unknown): string[] {
  if (typeof value === 'string') return value.length >= MIN_REDACTED_SECRET_LENGTH ? [value] : [];
  if (value && typeof value === 'object') return Object.values(value).flatMap(secretStrings);
  return [];
}

function requiredModelId(
  binding: ResolvedCredentialBinding,
  modelKey:
    | CredentialAiLanguageModelKey
    | CredentialAiEmbeddingModelKey
    | CredentialAiDecisionModelKey
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
