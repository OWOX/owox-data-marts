/**
 * The wire format between an OWOX host page and a plugin running in its iframe.
 *
 * Exported as its own entry point so the host can import these types without pulling in
 * the transport. The transport is not exported from anywhere: that is what makes
 * "plugin code cannot construct or configure it" a property of the package rather than
 * a rule someone has to remember.
 */

export const PLUGIN_PROTOCOL_VERSION = 1 as const;

/**
 * The plugin's own origin, as the host sees it: a sandboxed frame is opaque, so
 * `event.origin` on a message from the plugin is the literal string "null", and the
 * plugin's outbound postMessage must target '*'.
 *
 * It is a real check in the one direction it applies -- the host requires it of the
 * plugin's announcement. It says nothing in the other direction: the host is served on
 * whatever origin the deployment uses, which the plugin cannot know, so a plugin
 * verifies the host by window identity instead.
 */
export const OPAQUE_ORIGIN = 'null';

/** Announces the plugin is listening. Deliberately carries no data. */
export interface PluginReadyMessage {
  owox: 'plugin-ready';
  v: typeof PLUGIN_PROTOCOL_VERSION;
}

/** Hands over one end of a MessageChannel, which becomes the only data path. */
export interface PluginHostInitMessage {
  owox: 'host-init';
  v: typeof PLUGIN_PROTOCOL_VERSION;
  nonce: string;
  context: PluginHostContext;
}

export interface PluginHelloMessage {
  owox: 'plugin-hello';
  v: typeof PLUGIN_PROTOCOL_VERSION;
  nonce: string;
}

/** Ambient information the host chooses to reveal. Display only: no tokens, ever. */
export interface PluginHostContext {
  readonly pluginId: string;
  readonly installationId: string;
  readonly projectId: string;
  /**
   * The member this plugin is running for.
   *
   * Their name and avatar are deliberately not here: `GET /api/auth/context` already
   * serves both to a plugin that needs them, and a second copy in the handshake would
   * only be one that goes stale.
   */
  readonly userId: string;
  readonly theme: 'light' | 'dark';
  /** Exact/logical handles that are both declared and configured for this installation. */
  readonly credentialHandles?: readonly PluginCredentialHandleDescriptor[];
}

export type PluginCredentialHandleDescriptor =
  | { readonly name: string; readonly kind: 'exact' }
  | {
      readonly name: string;
      readonly kind: 'ai';
      readonly models: readonly ('fast' | 'reasoning' | 'embedding')[];
    };

/**
 * Query parameters as ordered pairs rather than an object.
 *
 * A `Record` collapses repeated keys, and repeats are meaningful here: the API client
 * builds `?column=a&column=b` with `URLSearchParams.append`, so flattening would quietly
 * hand a plugin a different dataset than the same call makes outside the iframe.
 */
export type PluginQuery = readonly (readonly [string, string])[];

export type PluginRequest =
  | {
      id: string;
      kind: 'api';
      method: 'POST' | 'PUT';
      path: string;
      query?: PluginQuery;
      body?: unknown;
      accept?: string;
      stream?: false;
    }
  | {
      id: string;
      kind: 'api';
      method: 'PATCH';
      path: string;
      query?: PluginQuery;
      body: unknown;
      accept?: string;
      stream?: false;
    }
  | {
      id: string;
      kind: 'api';
      method: 'GET';
      path: string;
      query?: PluginQuery;
      accept?: string;
      stream?: false;
    }
  | {
      id: string;
      kind: 'api';
      method: 'DELETE';
      path: string;
      query?: PluginQuery;
      accept?: string;
      stream?: false;
    }
  | {
      id: string;
      kind: 'api';
      method: 'GET';
      path: string;
      query?: PluginQuery;
      stream: true;
    }
  | {
      id: string;
      kind: 'credentialFetch';
      /** Versioned independently so adding it does not reject protocol-v1 plugins. */
      version: 1;
      handle: string;
      url: string;
      method: string;
      headers?: Record<string, string>;
      bodyBase64?: string;
    }
  | {
      id: string;
      kind: 'credentialAi';
      /** Vercel AI SDK provider contract v4, versioned independently of the host protocol. */
      version: 1;
      handle: string;
      operation: 'generate' | 'embed';
      model: 'fast' | 'reasoning' | 'embedding';
      options: Record<string, unknown>;
      stream?: false;
    }
  | {
      id: string;
      kind: 'credentialAi';
      version: 1;
      handle: string;
      operation: 'stream';
      model: 'fast' | 'reasoning';
      options: Record<string, unknown>;
      stream: true;
    }
  | { id: string; kind: 'cancel'; targetId: string }
  | { id: string; kind: 'openExternal'; url: string }
  /**
   * A path inside OWOX, opened in place. Distinct from openExternal on purpose: one
   * leaves the app in a new tab, the other replaces the page the plugin is running on,
   * and the host validates them by different rules.
   */
  | { id: string; kind: 'navigate'; path: string };

/**
 * A request before the transport stamps its correlation id.
 *
 * Distributed on purpose: a plain `Omit` over a union collapses it to the keys every
 * member shares, which would silently erase `method` and `path`. Distribution only
 * happens across a naked generic parameter, so the indirection through `T` is
 * load-bearing.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type PluginRequestInput = DistributiveOmit<PluginRequest, 'id'>;

export type PluginErrorCode =
  /** The backend answered with a non-2xx status. */
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  /** The plugin was suspended deployment-wide while it was open. */
  | 'SUSPENDED'
  /** The host refused before making any request -- see its path and method checks. */
  | 'FORBIDDEN'
  /** Malformed envelope, or too many requests in flight. */
  | 'PROTOCOL_ERROR';

export interface PluginErrorPayload {
  code: PluginErrorCode;
  status?: number;
  message: string;
  details?: unknown;
}

export type PluginResponse =
  | { id: string; ok: true; status: number; headers: Record<string, string>; body: unknown }
  | {
      id: string;
      ok: true;
      status: number;
      headers: Record<string, string>;
      /** Transferred rather than copied, so NDJSON traversals stream as they arrive. */
      stream: ReadableStream<Uint8Array>;
    }
  | { id: string; ok: false; error: PluginErrorPayload };

export function isPluginReady(value: unknown): value is PluginReadyMessage {
  const message = value as PluginReadyMessage | null;
  return message?.owox === 'plugin-ready' && message.v === PLUGIN_PROTOCOL_VERSION;
}

export function isPluginHello(value: unknown): value is PluginHelloMessage {
  const message = value as PluginHelloMessage | null;
  return (
    message?.owox === 'plugin-hello' &&
    // Checked like the other two guards: without it an ack from a future SDK would be
    // accepted here and then read against this version's rules.
    message.v === PLUGIN_PROTOCOL_VERSION &&
    typeof message.nonce === 'string'
  );
}

export function isHostInit(value: unknown): value is PluginHostInitMessage {
  const message = value as PluginHostInitMessage | null;
  return (
    message?.owox === 'host-init' &&
    message.v === PLUGIN_PROTOCOL_VERSION &&
    typeof message.nonce === 'string'
  );
}
