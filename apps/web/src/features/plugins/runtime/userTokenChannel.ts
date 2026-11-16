import type { UserTokenSession } from './fetchUserToken';

const REQUEST = 'user-token-request';
const RESPONSE = 'user-token-response';
const MAX_ID_LENGTH = 64;

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

interface UserTokenRequest {
  owox: typeof REQUEST;
  id: string;
  fresh?: true;
}

function isUserTokenRequest(value: unknown): value is UserTokenRequest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.owox === REQUEST &&
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    candidate.id.length <= MAX_ID_LENGTH &&
    (candidate.fresh === undefined || candidate.fresh === true)
  );
}

/**
 * Hands the member's access token to a privileged plugin, outside the plugin bridge.
 *
 * The caller must create this only for a privileged plugin. A request is served only when
 * it comes from this frame's window and from `pluginOrigin`, and the answer is addressed to
 * that origin alone, so a document the frame navigated to never receives it. Anything else
 * is ignored without an answer, and a failure is answered without its reason.
 */
export function createUserTokenChannel(options: UserTokenChannelOptions): UserTokenChannel {
  let disposed = false;

  function onMessage(event: MessageEvent<unknown>): void {
    const frame = options.iframe.contentWindow;
    if (!frame || event.source !== frame || event.origin !== options.pluginOrigin) return;
    if (!isUserTokenRequest(event.data)) return;

    const { id } = event.data;
    const answer = (body: { token: string } | { error: true }) => {
      if (!disposed) frame.postMessage({ owox: RESPONSE, id, ...body }, options.pluginOrigin);
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
