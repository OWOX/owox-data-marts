/**
 * The wire format between this host page and a plugin running in its iframe.
 *
 * The host's own copy on purpose. @owox/plugin-sdk is published for plugin authors and
 * is deliberately not a dependency of this app: a package whose whole point is to be
 * consumed from npm by third parties should not also be a build input of the product it
 * plugs into. The two sides therefore agree by PLUGIN_PROTOCOL_VERSION, not by sharing a
 * module -- which is exactly the contract a plugin built against an older SDK has to
 * satisfy anyway.
 *
 * Change one side and the version must move with it. The handshake guards check the
 * version on every message, so a mismatch fails the handshake instead of being read
 * against the wrong rules.
 */

export const PLUGIN_PROTOCOL_VERSION = 1;

/**
 * The plugin's own origin, as this host sees it: a sandboxed frame is opaque, so
 * `event.origin` on a message from the plugin is the literal string "null".
 *
 * It is a real check in the one direction it applies -- the host requires it of the
 * plugin's announcement. It says nothing in the other direction: the host is served on
 * whatever origin the deployment uses, which the plugin cannot know, so a plugin
 * verifies the host by window identity instead.
 */
export const OPAQUE_ORIGIN = 'null';

/**
 * Announces the plugin is listening. Deliberately carries no data.
 *
 * `v` is a plain number here, unlike in the SDK: everything the host receives arrives
 * from a third-party frame, so a message claiming any other version is a case that
 * exists and has to be checked, not one the type system may assume away.
 */
export interface PluginReadyMessage {
  owox: 'plugin-ready';
  v: number;
}

/** Hands over one end of a MessageChannel, which becomes the only data path. */
export interface PluginHostInitMessage {
  owox: 'host-init';
  v: number;
  nonce: string;
  context: PluginHostContext;
}

export interface PluginHelloMessage {
  owox: 'plugin-hello';
  v: number;
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
}

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
      method: 'GET' | 'POST' | 'PUT';
      path: string;
      query?: PluginQuery;
      body?: unknown;
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
    // Checked like the ready guard: without it an ack from a future SDK would be
    // accepted here and then read against this version's rules.
    message.v === PLUGIN_PROTOCOL_VERSION &&
    typeof message.nonce === 'string'
  );
}
