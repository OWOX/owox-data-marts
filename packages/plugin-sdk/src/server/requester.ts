import type { IframeRequester } from '../iframe-transport.js';
import type { PluginErrorPayload, PluginRequestInput, PluginResponse } from '../protocol.js';

const EXECUTION_TOKEN_HEADER = 'x-owox-execution-token';

/** Keys the fetch server/node hands createBackend, so it is not an option callers can set. */
export const GUARDED_FETCH = Symbol('guardedFetch');
/** The code of server/node's lookup refusal, which undici reports as its error's `cause`. */
export const PRIVATE_ADDRESS_CODE = 'ERR_PRIVATE_ADDRESS';

type Call = { ok: true; response: Response } | { ok: false; error: PluginErrorPayload };

/** The frame's requester over fetch, so transport, collections and Credentials run unchanged. */
export function createServerRequester(options: {
  host: string;
  token: string;
  fetch?: typeof fetch;
}): IframeRequester {
  // A detached `fetch` throws "Illegal invocation" on Workers, so the default keeps its receiver.
  const fetchImpl =
    options.fetch ?? ((input: URL | RequestInfo, init?: RequestInit) => fetch(input, init));

  async function call(url: URL, init: RequestInit, signal?: AbortSignal): Promise<Call> {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...init,
        signal,
        redirect: 'manual',
        headers: {
          ...(init.headers as Record<string, string>),
          [EXECUTION_TOKEN_HEADER]: options.token,
        },
      });
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      const cause = (error as { cause?: { code?: unknown; message?: unknown } } | null)?.cause;
      if (cause?.code === PRIVATE_ADDRESS_CODE) {
        return { ok: false, error: { code: 'FORBIDDEN', message: String(cause.message) } };
      }
      return {
        ok: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
    if ((response.status >= 300 && response.status < 400) || response.type === 'opaqueredirect') {
      return {
        ok: false,
        error: { code: 'HTTP_ERROR', status: response.status, message: 'Redirects are refused' },
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        error: toErrorPayload(response.status, await response.json().catch(() => undefined)),
      };
    }
    return { ok: true, response };
  }

  async function send(request: PluginRequestInput, signal?: AbortSignal): Promise<PluginResponse> {
    if (request.kind === 'api') {
      const url = resolveApiUrl(options.host, request.path);
      if (!url) {
        return {
          id: '',
          ok: false,
          error: { code: 'FORBIDDEN', message: 'Only OWOX API paths can be called' },
        };
      }
      for (const [name, value] of request.query ?? []) url.searchParams.append(name, value);
      const body =
        'body' in request && request.body !== undefined ? JSON.stringify(request.body) : undefined;
      const result = await call(
        url,
        {
          method: request.method,
          headers: {
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            ...('accept' in request && request.accept ? { accept: request.accept } : {}),
          },
          body,
        },
        signal
      );
      if (!result.ok) return { id: '', ok: false, error: result.error };
      const { response } = result;
      const headers = Object.fromEntries(response.headers);
      if ('stream' in request && request.stream === true) {
        return {
          id: '',
          ok: true,
          status: response.status,
          headers,
          stream: response.body ?? new ReadableStream<Uint8Array>(),
        };
      }
      return {
        id: '',
        ok: true,
        status: response.status,
        headers,
        body: await response.json().catch(() => undefined),
      };
    }

    if (request.kind === 'credentialFetch') {
      const result = await call(
        new URL(
          `/api/plugins/runtime/credentials/${encodeURIComponent(request.handle)}/fetch`,
          options.host
        ),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            url: request.url,
            method: request.method,
            headers: request.headers,
            bodyBase64: request.bodyBase64,
          }),
        },
        signal
      );
      if (!result.ok) return { id: '', ok: false, error: result.error };
      return {
        id: '',
        ok: true,
        status: result.response.status,
        headers: Object.fromEntries(result.response.headers),
        body: await result.response.json().catch(() => undefined),
      };
    }

    return {
      id: '',
      ok: false,
      error: { code: 'PROTOCOL_ERROR', message: 'Not available in a backend action' },
    };
  }

  return { send };
}

function resolveApiUrl(host: string, path: string): URL | null {
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  const url = new URL(path, host);
  return url.origin === host && url.pathname.startsWith('/api/') ? url : null;
}

/** The bridge's mapping, so a Worker sees the same payloads a frame does. */
function toErrorPayload(status: number, body: unknown): PluginErrorPayload {
  const parsed = (typeof body === 'object' && body !== null ? body : {}) as {
    code?: unknown;
    message?: unknown;
    errorDetails?: unknown;
  };
  return {
    code: parsed.code === 'PLUGIN_SUSPENDED' ? 'SUSPENDED' : 'HTTP_ERROR',
    status,
    message:
      typeof parsed.message === 'string' ? parsed.message : `Request failed with ${String(status)}`,
    details: parsed.errorDetails,
    ...(typeof parsed.code === 'string' ? { apiCode: parsed.code } : {}),
  };
}
