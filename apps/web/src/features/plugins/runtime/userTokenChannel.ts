import type { UserTokenSession } from './fetchUserToken';

const REQUEST = 'user-token-request';

export interface UserTokenChannelOptions {
  iframe: HTMLIFrameElement;
  /** The real origin of the privileged plugin; requests from any other origin are ignored. */
  pluginOrigin: string;
  session: UserTokenSession;
  fetchUserToken: (fresh: boolean, session: UserTokenSession) => Promise<string>;
}

export interface UserTokenChannel {
  dispose(): void;
}

function isUserTokenRequest(value: unknown): value is { fresh?: true } {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.owox === REQUEST && (candidate.fresh === undefined || candidate.fresh === true);
}

/**
 * Hands the member's access token to a privileged plugin, outside the plugin bridge.
 *
 * The caller must create this only for a privileged plugin. A request is served only when
 * it comes from this frame's window and from `pluginOrigin`, and it must carry exactly one
 * port: the answer goes to that port and nowhere else, so it reaches only the document
 * that asked, never one the frame has navigated to since. Trust is at the level of the
 * origin: any document served from `pluginOrigin` in this frame may ask. Anything else is
 * ignored without an answer, and a failure is answered without its reason.
 */
export function createUserTokenChannel(options: UserTokenChannelOptions): UserTokenChannel {
  let disposed = false;

  function onMessage(event: MessageEvent<unknown>): void {
    const frame = options.iframe.contentWindow;
    if (!frame || event.source !== frame || event.origin !== options.pluginOrigin) return;
    if (!isUserTokenRequest(event.data) || event.ports.length !== 1) return;
    const port = event.ports[0];

    const answer = (body: { token: string } | { error: true }) => {
      if (!disposed) port.postMessage(body);
      port.close();
    };
    options.fetchUserToken(event.data.fresh === true, options.session).then(
      token => {
        answer({ token });
      },
      () => {
        answer({ error: true });
      }
    );
  }

  window.addEventListener('message', onMessage);
  return {
    dispose() {
      disposed = true;
      window.removeEventListener('message', onMessage);
    },
  };
}
