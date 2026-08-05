import type {
  PluginErrorPayload,
  PluginHostContext,
  PluginRequest,
  PluginResponse,
} from './protocol';
import { OPAQUE_ORIGIN, PLUGIN_PROTOCOL_VERSION, isPluginHello, isPluginReady } from './protocol';

/** Supplied by the runtime authorization track. There is deliberately no default. */
export type FetchRuntimeToken = () => Promise<{ runtimeToken: string; expiresIn: number }>;

export interface PluginHostBridgeOptions {
  iframe: HTMLIFrameElement;
  /** Assigned by the bridge, never by the markup -- see the note on ordering below. */
  src: string;
  apiOrigin: string;
  context: PluginHostContext;
  fetchRuntimeToken: FetchRuntimeToken;
  onOpenExternal: (url: string) => void;
  /** A page inside OWOX the plugin asks to go to. The host decides whether it may. */
  onNavigate: (path: string) => void;
  /**
   * The bridge closed the channel on its own, and the frame is now inert.
   *
   * Not called for `dispose()`: an unmount already knows. This exists because a silently
   * dead plugin looks exactly like a slow one -- the frame stays painted and the SDK's
   * calls simply hang until they time out.
   */
  onBroken?: () => void;
}

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT']);
/** Enough for any real plugin; the 33rd concurrent request is a runaway, not a workload. */
const MAX_IN_FLIGHT = 32;
/** Re-mint before the token lapses, so a long session never trips over an expiry. */
const REFRESH_MARGIN_MS = 60_000;
/** Everything else the backend returns is host detail the plugin has no use for. */
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'x-owox-run-id'];

export interface PluginHostBridge {
  dispose(): void;
}

/**
 * Brokers a plugin's API calls without ever handing it a credential.
 *
 * The runtime token lives in this closure. It is not React state, not context, not
 * storage, and never travels in a postMessage payload or a URL -- the plugin cannot
 * read it because it is never anywhere the plugin can look.
 */
export function createPluginHostBridge(options: PluginHostBridgeOptions): PluginHostBridge {
  const apiOrigin = new URL(options.apiOrigin, window.location.origin).origin;

  let runtimeToken: string | undefined;
  let tokenExpiresAt = 0;
  let port: MessagePort | undefined;
  let inFlight = 0;
  let disposed = false;
  /** The nonce this host sent with host-init, and whether the frame has echoed it back. */
  let nonce: string | undefined;
  let greeted = false;
  /**
   * Cancels requests already on the wire when the channel goes down.
   *
   * Closing the port only silences the answer: without this, a request that was in
   * flight when the plugin failed the nonce check still reaches the backend carrying
   * the runtime token, and still runs. Teardown has to stop the plugin acting, not just
   * stop it hearing back.
   */
  const teardown = new AbortController();

  async function currentToken(force = false): Promise<string> {
    if (force || !runtimeToken || Date.now() >= tokenExpiresAt - REFRESH_MARGIN_MS) {
      const minted = await options.fetchRuntimeToken();
      runtimeToken = minted.runtimeToken;
      tokenExpiresAt = Date.now() + minted.expiresIn * 1000;
    }

    return runtimeToken;
  }

  /**
   * The highest-severity check here.
   *
   * `new URL('//evil.example/x', origin)` resolves to `https://evil.example/x`, so a
   * string prefix test would let a plugin make the host send the runtime token to an
   * attacker. Resolving first and comparing origins is what closes that.
   */
  function resolvePath(request: Extract<PluginRequest, { kind: 'api' }>): URL {
    const url = new URL(request.path, apiOrigin);

    if (url.origin !== apiOrigin) {
      throw forbidden('Requests must stay on the OWOX API origin');
    }

    if (!url.pathname.startsWith('/api/')) {
      throw forbidden('Requests must target a path under /api/');
    }

    if (!ALLOWED_METHODS.has(request.method)) {
      throw forbidden(`${request.method} is not allowed from a plugin`);
    }

    // append, not set: the pairs arrive ordered and may repeat a key, which is how the
    // API client expresses a multi-column selection.
    for (const [key, value] of request.query ?? []) {
      url.searchParams.append(key, value);
    }

    return url;
  }

  async function forward(
    request: Extract<PluginRequest, { kind: 'api' }>,
    retryOnUnauthorized = true
  ): Promise<PluginResponse> {
    const url = resolvePath(request);

    // Deliberately bare fetch, not the app's shared axios client: that one attaches the
    // *member* token and drives the global refresh-and-logout flow, so a plugin-triggered
    // 401 would sign the real user out with full member authority already on the wire.
    const response = await fetch(url.toString(), {
      method: request.method,
      signal: teardown.signal,
      headers: {
        'x-owox-authorization': `Bearer ${await currentToken()}`,
        ...('body' in request && request.body !== undefined
          ? { 'content-type': 'application/json' }
          : {}),
        ...('accept' in request && request.accept ? { accept: request.accept } : {}),
      },
      ...('body' in request && request.body !== undefined
        ? { body: JSON.stringify(request.body) }
        : {}),
    });

    if (response.status === 401 && retryOnUnauthorized) {
      await currentToken(true);
      return forward(request, false);
    }

    const headers = pickHeaders(response);

    if ('stream' in request && request.stream === true) {
      if (!response.ok) {
        return { id: request.id, ok: false, error: await readError(response) };
      }

      return {
        id: request.id,
        ok: true,
        status: response.status,
        headers,
        stream: response.body ?? new ReadableStream<Uint8Array>(),
      };
    }

    const body: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
      return { id: request.id, ok: false, error: toErrorPayload(response.status, body) };
    }

    // Built field by field rather than by spreading anything that touched the request,
    // so the token cannot ride along by accident.
    return { id: request.id, ok: true, status: response.status, headers, body };
  }

  async function handle(candidate: unknown): Promise<void> {
    // The ack for host-init, and the only message on this port that is not a request.
    //
    // A wrong nonce cannot be a race: the port was transferred to this frame and nowhere
    // else, so whoever answers holds it. Echoing something else means the other end
    // failed the one check it was given, and the channel is not worth keeping.
    if (isPluginHello(candidate)) {
      if (candidate.nonce === nonce) {
        greeted = true;
      } else {
        shutdown();
        options.onBroken?.();
      }
      return;
    }

    // Anything else without a kind is malformed: the api branch would resolve `undefined`
    // against the API origin and answer FORBIDDEN with no correlation id -- noise the SDK
    // can only drop. Ignoring it is the whole of the correct behaviour.
    const request = candidate as PluginRequest | null;
    if (!request?.kind) {
      return;
    }

    // MessagePort delivery is ordered and the SDK acks before it can issue anything, so a
    // request arriving first is not a slow handshake -- it is an end that never completed one.
    if (!greeted) {
      reply({
        id: request.id,
        ok: false,
        error: { code: 'PROTOCOL_ERROR', message: 'The plugin handshake is not complete' },
      });
      return;
    }

    if (request.kind === 'openExternal') {
      options.onOpenExternal(request.url);
      return;
    }

    if (request.kind === 'navigate') {
      options.onNavigate(request.path);
      return;
    }

    if (inFlight >= MAX_IN_FLIGHT) {
      reply({
        id: request.id,
        ok: false,
        error: { code: 'PROTOCOL_ERROR', message: 'Too many requests in flight' },
      });
      return;
    }

    inFlight += 1;
    try {
      const response = await forward(request);
      reply(response, 'stream' in response ? [response.stream] : []);
    } catch (caught) {
      reply({ id: request.id, ok: false, error: asErrorPayload(caught) });
    } finally {
      inFlight -= 1;
    }
  }

  function reply(response: PluginResponse, transfer: Transferable[] = []): void {
    port?.postMessage(response, transfer);
  }

  /** Teardown, whether the caller asked for it or the plugin failed the nonce check. */
  function shutdown(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    window.removeEventListener('message', onWindowMessage);
    port?.close();
    port = undefined;
    // Before the token is dropped: an aborted request is one that never finishes
    // carrying it.
    teardown.abort();
    // The token dies with the closure.
    runtimeToken = undefined;
  }

  function onWindowMessage(event: MessageEvent<unknown>): void {
    // Identity, not origin: a sandboxed frame has an opaque origin, so there is nothing
    // meaningful to compare. The origin check below is a tripwire for allow-same-origin
    // creeping into the sandbox.
    if (event.source !== options.iframe.contentWindow) {
      return;
    }

    if (event.origin !== OPAQUE_ORIGIN || !isPluginReady(event.data) || port) {
      return;
    }

    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = (message: MessageEvent<unknown>) => void handle(message.data);
    port.start();

    // Stop listening the moment the channel exists: after this, a window.postMessage
    // from the frame reaches nothing, so requests can only arrive on the port.
    window.removeEventListener('message', onWindowMessage);

    nonce = crypto.randomUUID();

    options.iframe.contentWindow?.postMessage(
      {
        owox: 'host-init',
        v: PLUGIN_PROTOCOL_VERSION,
        nonce,
        context: options.context,
      },
      '*',
      [channel.port2]
    );
  }

  window.addEventListener('message', onWindowMessage);

  // Source is assigned only after the listener is attached. React commits an element's
  // src before effects run, so a declarative src would let a fast plugin announce itself
  // before anyone was listening -- and its announcement would be lost.
  options.iframe.src = options.src;

  return { dispose: shutdown };
}

function pickHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) {
      headers[name] = value;
    }
  }

  return headers;
}

async function readError(response: Response): Promise<PluginErrorPayload> {
  return toErrorPayload(response.status, await response.json().catch(() => undefined));
}

function toErrorPayload(status: number, body: unknown): PluginErrorPayload {
  const parsed = body as { code?: string; message?: string; errorDetails?: unknown } | undefined;

  return {
    // Suspension is distinct: the plugin is not broken and the member's installation is
    // intact, so the SDK can say so rather than reporting a generic failure.
    code: parsed?.code === 'PLUGIN_SUSPENDED' ? 'SUSPENDED' : 'HTTP_ERROR',
    status,
    message: parsed?.message ?? `Request failed with ${String(status)}`,
    details: parsed?.errorDetails,
  };
}

function forbidden(message: string): PluginTransportRefusal {
  return new PluginTransportRefusal({ code: 'FORBIDDEN', message });
}

class PluginTransportRefusal extends Error {
  constructor(readonly payload: PluginErrorPayload) {
    super(payload.message);
    this.name = 'PluginTransportRefusal';
  }
}

function asErrorPayload(caught: unknown): PluginErrorPayload {
  if (caught instanceof PluginTransportRefusal) {
    return caught.payload;
  }

  return {
    code: 'NETWORK_ERROR',
    message: caught instanceof Error ? caught.message : 'The request could not be completed',
  };
}
