import type { OWOXTransport } from '@owox/api-client';
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

interface Pending {
  resolve: (response: PluginResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
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
export function createIframeTransport(port: MessagePort): OWOXTransport {
  const pending = new Map<string, Pending>();

  port.onmessage = (event: MessageEvent<PluginResponse>) => {
    const response = event.data;
    const waiting = pending.get(response?.id);
    if (!waiting) {
      // An unknown id is either a duplicate of something already settled or noise.
      // Dropping it silently is the only safe reading.
      return;
    }

    pending.delete(response.id);
    if (waiting.timer) {
      clearTimeout(waiting.timer);
    }
    waiting.resolve(response);
  };

  function send(request: PluginRequestInput): Promise<PluginResponse> {
    // Generated here, inside the closure: a plugin author never sees a correlation id
    // and so cannot address someone else's in-flight request.
    const id = crypto.randomUUID();

    return new Promise<PluginResponse>((resolve, reject) => {
      const isStream = 'stream' in request && request.stream === true;

      const timer = isStream
        ? null
        : setTimeout(() => {
            pending.delete(id);
            reject(
              new PluginTransportError({ code: 'TIMEOUT', message: 'The host did not answer' })
            );
          }, REQUEST_TIMEOUT_MS);

      pending.set(id, { resolve, reject, timer });
      port.postMessage({ ...request, id } as PluginRequest);
    });
  }

  async function json<T>(request: PluginRequestInput): Promise<T> {
    const response = await send(request);
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

    async getStream(path: string, query?: URLSearchParams): Promise<Response> {
      const response = await send({
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
