import type { IframeRequester } from './iframe-transport.js';
import { PluginTransportError } from './iframe-transport.js';
import type {
  EmbeddingModelV4,
  EmbeddingModelV4CallOptions,
  EmbeddingModelV4Result,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';

export type CredentialFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface CredentialHandle {
  /** A fetch-compatible function whose authentication is injected by the OWOX Host. */
  asFetch(): CredentialFetch;
}

export interface AiCredentialHandle extends LanguageModelV4 {
  /**
   * Logical model capabilities explicitly declared by the current plugin version.
   * The direct handle and `fast` reference the same model when `fast` is declared.
   */
  readonly fast?: LanguageModelV4;
  readonly reasoning?: LanguageModelV4;
  readonly embedding?: EmbeddingModelV4;
}

export type PluginCredentialHandleDescriptor =
  | { readonly name: string; readonly kind: 'exact' }
  | {
      readonly name: string;
      readonly kind: 'ai';
      readonly models: readonly ('fast' | 'reasoning' | 'embedding')[];
    };

export type PluginCredentials = Readonly<
  Record<string, CredentialHandle | AiCredentialHandle | undefined>
> & {
  readonly ai?: AiCredentialHandle;
};

/**
 * Returns any declared exact Credential handle with one stable compile-time type.
 *
 * Built-in and external definitions follow the same runtime path, so neither the SDK nor a
 * plugin needs a hardcoded provider-name list. Logical AI handles deliberately return undefined.
 */
export function exactCredential(
  credentials: PluginCredentials,
  name: string
): CredentialHandle | undefined {
  const handle = credentials[name];
  if (!handle || !('asFetch' in handle) || typeof handle.asFetch !== 'function') {
    return undefined;
  }
  return handle;
}

interface CredentialFetchEnvelope {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly bodyBase64: string;
}

/** @internal Creates dynamic handles declared by the current plugin version. */
export function createPluginCredentials(
  requester: IframeRequester,
  declaredHandles: readonly (string | PluginCredentialHandleDescriptor)[]
): PluginCredentials {
  const descriptors = new Map(
    declaredHandles.map(handle => [
      typeof handle === 'string' ? handle : handle.name,
      typeof handle === 'string' ? ({ name: handle, kind: 'exact' } as const) : handle,
    ])
  );
  const created = new Map<string, CredentialHandle | AiCredentialHandle>();
  const resolveHandle = (property: string): CredentialHandle | AiCredentialHandle | undefined => {
    if (property === 'then') return undefined;
    const descriptor = descriptors.get(property);
    if (!descriptor) return undefined;
    const cached = created.get(property);
    if (cached) return cached;
    const handle =
      descriptor.kind === 'exact'
        ? createExactHandle(requester, property)
        : createAiHandle(requester, property, descriptor.models);
    created.set(property, handle);
    return handle;
  };
  return new Proxy(Object.create(null) as Record<string, CredentialHandle | AiCredentialHandle>, {
    get(_target, property) {
      return typeof property === 'string' ? resolveHandle(property) : undefined;
    },
    has(_target, property) {
      return typeof property === 'string' && property !== 'then' && descriptors.has(property);
    },
    ownKeys() {
      return [...descriptors.keys()].filter(property => property !== 'then');
    },
    getOwnPropertyDescriptor(_target, property) {
      if (typeof property !== 'string' || property === 'then' || !descriptors.has(property)) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
        get: () => resolveHandle(property),
      };
    },
    set() {
      return false;
    },
  });
}

function createExactHandle(requester: IframeRequester, handle: string): CredentialHandle {
  return {
    asFetch: () => async (input, init) => {
      const request = new Request(input, init);
      if (request.signal.aborted) {
        throw request.signal.reason ?? new DOMException('The request was aborted', 'AbortError');
      }

      const method = request.method.toUpperCase();
      const body =
        method === 'GET' || method === 'HEAD'
          ? undefined
          : encodeBase64(new Uint8Array(await request.arrayBuffer()));
      const headers: Record<string, string> = {};
      request.headers.forEach((value, name) => {
        headers[name] = value;
      });

      const response = await requester.send(
        {
          kind: 'credentialFetch',
          version: 1,
          handle,
          url: request.url,
          method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD',
          headers,
          ...(body ? { bodyBase64: body } : {}),
        },
        request.signal
      );
      if (!response.ok) throw new PluginTransportError(response.error);
      if (!('body' in response) || !isEnvelope(response.body)) {
        throw new PluginTransportError({
          code: 'PROTOCOL_ERROR',
          message: 'The Host returned an invalid Credential response',
        });
      }

      const envelope = response.body;
      const bodyBytes = decodeBase64(envelope.bodyBase64);
      const bodyAllowed = ![204, 205, 304].includes(envelope.status);
      return new Response(bodyAllowed ? (bodyBytes.buffer as ArrayBuffer) : null, {
        status: envelope.status,
        headers: envelope.headers,
      });
    },
  };
}

function createAiHandle(
  requester: IframeRequester,
  handle: string,
  declaredModels: readonly ('fast' | 'reasoning' | 'embedding')[]
): AiCredentialHandle {
  const models = new Set(declaredModels);
  const directModel = models.has('fast')
    ? createLanguageModel(requester, handle, 'fast')
    : createUndeclaredFastModel(handle);
  const result = directModel as LanguageModelV4 & Record<string, unknown>;
  if (models.has('fast')) {
    result.fast = directModel;
  }
  if (models.has('reasoning')) {
    result.reasoning = createLanguageModel(requester, handle, 'reasoning');
  }
  if (models.has('embedding')) {
    result.embedding = createEmbeddingModel(requester, handle, 'embedding');
  }
  return Object.freeze(result) as AiCredentialHandle;
}

function createUndeclaredFastModel(handle: string): LanguageModelV4 {
  const reject = async (): Promise<never> => {
    throw new PluginTransportError({
      code: 'FORBIDDEN',
      message: `AI model fast is not declared for Credential handle ${handle}`,
    });
  };
  return {
    specificationVersion: 'v4',
    provider: 'owox.credentials',
    modelId: `${handle}:fast`,
    supportedUrls: {},
    doGenerate: reject,
    doStream: reject,
  };
}

function createLanguageModel(
  requester: IframeRequester,
  handle: string,
  model: 'fast' | 'reasoning'
): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'owox.credentials',
    modelId: `${handle}:${model}`,
    supportedUrls: {},
    async doGenerate(options: LanguageModelV4CallOptions) {
      const response = await requester.send(
        {
          kind: 'credentialAi',
          version: 1,
          handle,
          operation: 'generate',
          model,
          options: encodeAiOptions(options),
        },
        options.abortSignal
      );
      if (!response.ok) throw new PluginTransportError(response.error);
      if (!('body' in response)) throw invalidAiResponse();
      return decodePortable(response.body) as LanguageModelV4GenerateResult;
    },
    async doStream(options: LanguageModelV4CallOptions) {
      const response = await requester.send(
        {
          kind: 'credentialAi',
          version: 1,
          handle,
          operation: 'stream',
          model,
          options: encodeAiOptions(options),
          stream: true,
        },
        options.abortSignal
      );
      if (!response.ok) throw new PluginTransportError(response.error);
      if (!('stream' in response)) throw invalidAiResponse();
      return { stream: parseAiStream(response.stream) };
    },
  };
}

function createEmbeddingModel(
  requester: IframeRequester,
  handle: string,
  model: 'embedding'
): EmbeddingModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'owox.credentials',
    modelId: `${handle}:${model}`,
    maxEmbeddingsPerCall: undefined,
    supportsParallelCalls: true,
    async doEmbed(options: EmbeddingModelV4CallOptions) {
      const response = await requester.send(
        {
          kind: 'credentialAi',
          version: 1,
          handle,
          operation: 'embed',
          model,
          options: encodeAiOptions(options),
        },
        options.abortSignal
      );
      if (!response.ok) throw new PluginTransportError(response.error);
      if (!('body' in response)) throw invalidAiResponse();
      return decodePortable(response.body) as EmbeddingModelV4Result;
    },
  };
}

function encodeAiOptions(
  options: LanguageModelV4CallOptions | EmbeddingModelV4CallOptions
): Record<string, unknown> {
  const {
    abortSignal: _signal,
    headers: _headers,
    providerOptions: _providerOptions,
    ...rest
  } = options;
  void _signal;
  void _headers;
  void _providerOptions;
  const encoded = encodePortable(stripProviderOptions(rest, 0), 0, new WeakSet<object>());
  if (!isRecord(encoded)) throw new TypeError('AI options must be portable');
  return encoded;
}

function parseAiStream(
  source: ReadableStream<Uint8Array>
): ReadableStream<LanguageModelV4StreamPart> {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  return new ReadableStream<LanguageModelV4StreamPart>({
    async pull(controller) {
      try {
        while (true) {
          const newline = buffered.indexOf('\n');
          if (newline >= 0) {
            const line = buffered.slice(0, newline).trim();
            buffered = buffered.slice(newline + 1);
            if (line.length === 0) continue;
            controller.enqueue(decodePortable(JSON.parse(line)) as LanguageModelV4StreamPart);
            return;
          }

          const { done, value } = await reader.read();
          if (done) {
            buffered += decoder.decode();
            const line = buffered.trim();
            buffered = '';
            if (line.length > 0) {
              controller.enqueue(decodePortable(JSON.parse(line)) as LanguageModelV4StreamPart);
            } else {
              controller.close();
            }
            return;
          }
          buffered += decoder.decode(value, { stream: true });
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

const TYPE_MARKER = '$owoxCredentialPortableType';
const MAX_PORTABLE_DEPTH = 40;

function encodePortable(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  assertPortableDepth(depth);
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('AI options contain an invalid number');
    return value;
  }
  if (value instanceof Uint8Array) {
    return { [TYPE_MARKER]: 'bytes', value: encodeBase64(value) };
  }
  if (value instanceof URL) return { [TYPE_MARKER]: 'url', value: value.toString() };
  if (value instanceof Date) return { [TYPE_MARKER]: 'date', value: value.toISOString() };
  if (typeof value !== 'object') throw new TypeError('AI options are not portable');
  if (seen.has(value)) throw new TypeError('AI options contain a cycle');
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map(item => encodePortable(item, depth + 1, seen));
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, encodePortable(item, depth + 1, seen)])
        .filter(([, item]) => item !== undefined)
    );
  } finally {
    seen.delete(value);
  }
}

function decodePortable(value: unknown, depth = 0): unknown {
  assertPortableDepth(depth);
  if (Array.isArray(value)) return value.map(item => decodePortable(item, depth + 1));
  if (!isRecord(value)) return value;
  if (
    Object.keys(value).length === 2 &&
    typeof value.value === 'string' &&
    (value[TYPE_MARKER] === 'bytes' ||
      value[TYPE_MARKER] === 'url' ||
      value[TYPE_MARKER] === 'date')
  ) {
    if (value[TYPE_MARKER] === 'bytes') return decodeBase64(value.value);
    if (value[TYPE_MARKER] === 'url') return new URL(value.value);
    return new Date(value.value);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, decodePortable(item, depth + 1)])
  );
}

function stripProviderOptions(value: unknown, depth: number): unknown {
  assertPortableDepth(depth);
  if (Array.isArray(value)) return value.map(item => stripProviderOptions(item, depth + 1));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'providerOptions')
      .map(([key, item]) => [key, stripProviderOptions(item, depth + 1)])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertPortableDepth(depth: number): void {
  if (depth > MAX_PORTABLE_DEPTH) throw new TypeError('AI value is nested too deeply');
}

function invalidAiResponse(): PluginTransportError {
  return new PluginTransportError({
    code: 'PROTOCOL_ERROR',
    message: 'The Host returned an invalid AI response',
  });
}

function isEnvelope(value: unknown): value is CredentialFetchEnvelope {
  const candidate = value as CredentialFetchEnvelope | null;
  return (
    candidate !== null &&
    typeof candidate === 'object' &&
    Number.isInteger(candidate.status) &&
    candidate.status >= 100 &&
    candidate.status <= 599 &&
    typeof candidate.bodyBase64 === 'string' &&
    typeof candidate.headers === 'object' &&
    candidate.headers !== null
  );
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
