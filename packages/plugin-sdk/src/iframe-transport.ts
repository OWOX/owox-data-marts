import type { OWOXTransportWithLowLevelWrites } from '@owox/api-client';
import type {
  PluginErrorPayload,
  PluginRequest,
  PluginRequestInput,
  PluginResponse,
} from './protocol.js';

/**
 * Matches the shared axios timeout in the OWOX web app rather than inventing another.
 * A streamed response drops this timer once its head arrives, because NDJSON
 * traversals legitimately run for minutes.
 */
const REQUEST_TIMEOUT_MS = 30_000;
/** Matches the backend provider budget for non-stream AI generation and embedding. */
const AI_REQUEST_TIMEOUT_MS = 120_000;

interface Pending {
  resolve: (response: PluginResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  signal?: AbortSignal;
  onAbort?: () => void;
  cancel: () => void;
}

export interface IframeRequester {
  send(request: PluginRequestInput, signal?: AbortSignal): Promise<PluginResponse>;
}

export class PluginTransportError extends Error {
  constructor(readonly payload: PluginErrorPayload) {
    super(payload.message);
    this.name = 'PluginTransportError';
  }
}

/**
 * Forwards every call to the host over a MessagePort.
 *
 * The plugin holds no credential and issues no request to OWOX. It holds one end of a
 * channel and can only ask the host to make calls the host has already decided are
 * allowed -- so the worst a compromised plugin can do is ask for something and be
 * refused.
 *
 * Not exported from either package entry point. Plugin code cannot reach this class,
 * cannot construct one, and cannot swap the port underneath it.
 */
export function createIframeRequester(port: MessagePort): IframeRequester {
  const pending = new Map<string, Pending>();

  port.onmessage = (event: MessageEvent<PluginResponse>) => {
    const response = event.data;
    const waiting = pending.get(response?.id);
    if (!waiting) {
      // An unknown id is either a duplicate of something already settled or noise.
      // Dropping it silently is the only safe reading.
      return;
    }

    if (waiting.timer) {
      clearTimeout(waiting.timer);
    }
    if (waiting.signal && waiting.onAbort) {
      waiting.signal.removeEventListener('abort', waiting.onAbort);
    }
    pending.delete(response.id);
    if ('stream' in response) {
      waiting.resolve({
        ...response,
        stream: cancellableStream(response.stream, waiting.signal, waiting.cancel),
      });
      return;
    }
    waiting.resolve(response);
  };

  function send(request: PluginRequestInput, signal?: AbortSignal): Promise<PluginResponse> {
    // Generated here, inside the closure: a plugin author never sees a correlation id
    // and so cannot address someone else's in-flight request.
    const id = crypto.randomUUID();

    return new Promise<PluginResponse>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new DOMException('The request was aborted', 'AbortError'));
        return;
      }
      const isStream = 'stream' in request && request.stream === true;
      const timeoutMs =
        request.kind === 'credentialAi' ? AI_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS;

      const cancel = () => {
        port.postMessage({
          id: crypto.randomUUID(),
          kind: 'cancel',
          targetId: id,
        } satisfies PluginRequest);
      };
      const timer = isStream
        ? null
        : setTimeout(() => {
            pending.delete(id);
            signal?.removeEventListener('abort', onAbort);
            cancel();
            reject(
              new PluginTransportError({ code: 'TIMEOUT', message: 'The host did not answer' })
            );
          }, timeoutMs);

      const onAbort = () => {
        const waiting = pending.get(id);
        if (!waiting) return;
        pending.delete(id);
        if (waiting.timer) clearTimeout(waiting.timer);
        cancel();
        reject(signal?.reason ?? new DOMException('The request was aborted', 'AbortError'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      pending.set(id, { resolve, reject, timer, signal, onAbort, cancel });
      port.postMessage({ ...request, id } as PluginRequest);
    });
  }

  return { send };
}

function cancellableStream(
  source: ReadableStream<Uint8Array>,
  signal: AbortSignal | undefined,
  cancelHost: () => void
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let settled = false;
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;

  const cleanup = () => {
    signal?.removeEventListener('abort', onAbort);
  };
  const settle = () => {
    if (settled) return false;
    settled = true;
    cleanup();
    return true;
  };
  const onAbort = () => {
    if (!settle()) return;
    cancelHost();
    const reason = signal?.reason ?? new DOMException('The request was aborted', 'AbortError');
    void reader.cancel(reason).catch(() => undefined);
    streamController?.error(reason);
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (settled) return;
        if (done) {
          settle();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        if (settle()) controller.error(error);
      }
    },
    async cancel(reason) {
      if (settle()) cancelHost();
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}

export function createIframeTransport(
  portOrRequester: MessagePort | IframeRequester
): OWOXTransportWithLowLevelWrites {
  const requester =
    'send' in portOrRequester ? portOrRequester : createIframeRequester(portOrRequester);

  async function json<T>(request: PluginRequestInput): Promise<T> {
    const response = await requester.send(request);
    if (!response.ok) {
      throw new PluginTransportError(response.error);
    }

    return ('body' in response ? response.body : undefined) as T;
  }

  return {
    getJson: <T>(path: string, query?: Record<string, string>) =>
      json<T>({ kind: 'api', method: 'GET', path, query: query && Object.entries(query) }),

    postJson: <T>(path: string, jsonBody: unknown, accept?: string) =>
      json<T>({ kind: 'api', method: 'POST', path, body: jsonBody, accept }),

    putJson: <T>(path: string, jsonBody: unknown) =>
      json<T>({ kind: 'api', method: 'PUT', path, body: jsonBody }),

    patchJson: <T>(path: string, jsonBody: unknown) =>
      json<T>({ kind: 'api', method: 'PATCH', path, body: jsonBody }),

    deleteJson: <T = void>(path: string) => json<T>({ kind: 'api', method: 'DELETE', path }),

    async getStream(path: string, query?: URLSearchParams): Promise<Response> {
      const response = await requester.send({
        kind: 'api',
        method: 'GET',
        path,
        // Pairs, not an object: `?column=a&column=b` is how the API client asks for two
        // columns, and `Object.fromEntries` would keep only the last one.
        query: query && [...query],
        stream: true,
      });

      if (!response.ok) {
        throw new PluginTransportError(response.error);
      }

      if (!('stream' in response)) {
        throw new PluginTransportError({
          code: 'PROTOCOL_ERROR',
          message: 'The host answered a stream request without a stream',
        });
      }

      // Rebuilt into a Response so the existing NDJSON traversal code works unchanged,
      // including the run-id header it reads.
      return new Response(response.stream, {
        status: response.status,
        headers: response.headers,
      });
    },
  };
}
