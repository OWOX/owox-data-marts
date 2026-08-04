import { OWOXApiClient } from '@owox/api-client';
import { createIframeTransport } from './iframe-transport.js';
import {
  isHostInit,
  PLUGIN_PROTOCOL_VERSION,
  type PluginHostContext,
  type PluginHostInitMessage,
} from './protocol.js';

export { PLUGIN_PROTOCOL_VERSION } from './protocol.js';
export type { PluginErrorCode, PluginErrorPayload, PluginHostContext } from './protocol.js';

/** Long enough for a slow host, short enough that a broken embed fails visibly. */
const HANDSHAKE_TIMEOUT_MS = 10_000;
/** The host may not be listening yet when we first announce, so keep announcing. */
const READY_RETRY_MS = 250;

/** Host-mediated actions. Each is a request; the host validates and decides. */
export interface PluginUi {
  /** Opens an external URL in a new tab, because the sandbox denies you popups. */
  openExternal(url: string): Promise<void>;

  /**
   * Goes to a page inside OWOX Data Marts, in place of this plugin.
   *
   * `path` is absolute within the app, e.g. `/ui/${ctx.projectId}/data-marts/${id}`. The
   * host refuses anything that resolves off its own origin, so this cannot become a way
   * out of the app -- and your frame is unmounted when it does navigate.
   */
  navigate(path: string): void;
}

export interface PluginContext extends PluginHostContext {
  /**
   * A real OWOX API client whose transport is owned by this SDK.
   *
   * Plugin code cannot construct, replace or inspect that transport, and no token ever
   * enters this document -- every call is brokered by the trusted host page.
   */
  readonly owox: OWOXApiClient;

  /**
   * Things the sandbox forbids you, which the host will do on your behalf if it agrees.
   *
   * Grouped rather than spread across the context: each one is a request the host is free
   * to refuse, which is a different relationship from `owox`, where you are the one acting.
   */
  readonly ui: PluginUi;

  /** Aborts when the host tears this plugin down. */
  readonly signal: AbortSignal;
}

/**
 * The port, bound exactly once and unreachable from anything this module exports.
 *
 * Module scope rather than a field on the context: a plugin that could reach the port
 * could read every response the host sends, including ones it never asked for.
 */
let boundPort: MessagePort | undefined;
let connectPromise: Promise<PluginContext> | undefined;
/** Tears down an in-flight handshake: its listener, its announcer and its deadline. */
let abandonHandshake: (() => void) | undefined;

/**
 * Completes the host handshake and returns the plugin context.
 *
 * Idempotent: repeated calls return the same promise, so a plugin cannot open a second
 * channel by calling twice.
 */
export function connect(): Promise<PluginContext> {
  connectPromise ??= performHandshake();
  return connectPromise;
}

function performHandshake(): Promise<PluginContext> {
  return new Promise<PluginContext>((resolve, reject) => {
    // An unframed document has no host. Without this the identity check below is
    // vacuous -- window.parent === window -- and a page could hand itself a channel.
    if (typeof window === 'undefined' || window.parent === window) {
      reject(new Error('This page is not running inside an OWOX plugin frame'));
      return;
    }

    const teardown = new AbortController();

    const announce = () => {
      window.parent.postMessage(
        { owox: 'plugin-ready', v: PLUGIN_PROTOCOL_VERSION },
        // A concrete target origin never matches an opaque one, so the message would
        // be dropped silently. This carries no data precisely because of that.
        '*'
      );
    };

    const stop = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(announcer);
      clearTimeout(deadline);
      abandonHandshake = undefined;
    };

    abandonHandshake = stop;

    function onMessage(event: MessageEvent<unknown>) {
      // Identity of the sending window, and deliberately nothing about its origin.
      //
      // The opaque origin belongs to *this* document, not to the host: a message coming
      // the other way carries the host's real origin, which this plugin has no way to
      // know and no business demanding. Requiring "null" here refused every genuine host
      // and left connect() timing out -- caught by running the packaged SDK against a
      // real host, because the unit tests delivered host-init as if the host were opaque
      // too.
      if (event.source !== window.parent) {
        return;
      }

      const [port] = event.ports;
      // Exactly one port: a host-init with none has no channel to offer, and one with
      // several is not a shape this protocol defines.
      if (!isHostInit(event.data) || event.ports.length !== 1 || !port) {
        return;
      }

      // Immutable for the document's lifetime: a second host-init, forged or genuine,
      // cannot redirect an already-running plugin onto another channel.
      if (boundPort) {
        return;
      }

      stop();
      resolve(bind(event.data, port, teardown));
    }

    window.addEventListener('message', onMessage);
    announce();

    const announcer = setInterval(announce, READY_RETRY_MS);
    const deadline = setTimeout(() => {
      stop();
      reject(new Error('The OWOX host did not complete the plugin handshake'));
    }, HANDSHAKE_TIMEOUT_MS);
  });
}

function bind(
  init: PluginHostInitMessage,
  port: MessagePort,
  teardown: AbortController
): PluginContext {
  boundPort = port;
  port.start();
  port.postMessage({ owox: 'plugin-hello', v: PLUGIN_PROTOCOL_VERSION, nonce: init.nonce });

  window.addEventListener('pagehide', () => {
    teardown.abort();
  });

  const owox = new OWOXApiClient({ transport: createIframeTransport(port) });

  return {
    ...init.context,
    owox,
    ui: {
      openExternal: (url: string) => {
        port.postMessage({ id: crypto.randomUUID(), kind: 'openExternal', url });
        return Promise.resolve();
      },
      navigate: (path: string) => {
        port.postMessage({ id: crypto.randomUUID(), kind: 'navigate', path });
      },
    },
    signal: teardown.signal,
  };
}

/**
 * Test seam only: the module-level binding is deliberately not resettable in production.
 *
 * Detaches any in-flight handshake as well. A reset that clears the flags but leaves the
 * message listener attached is not a reset -- the stale listener still answers the next
 * host-init, claims the binding, and silently starves the handshake that is actually
 * waiting for it.
 */
export function __resetForTests(): void {
  abandonHandshake?.();
  boundPort = undefined;
  connectPromise = undefined;
}
