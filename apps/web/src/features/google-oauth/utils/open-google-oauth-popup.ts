interface OAuthCallbackData {
  type: string;
  code?: string;
  state?: string;
  error?: string;
}

export class GoogleOAuthPopupClosedError extends Error {
  constructor() {
    super('The Google sign-in window was closed');
    this.name = 'GoogleOAuthPopupClosedError';
  }
}

/**
 * Opens the Google consent popup and resolves with the code it forwards back. The exchange must
 * run in the opener window: the popup never authenticates, so it cannot race the rotating
 * refresh-token cookie or land in a different project context.
 */
export function openGoogleOAuthPopup(
  authorizationUrl: string
): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const expectedState = new URL(authorizationUrl).searchParams.get('state');
    const width = 600;
    const height = 700;
    const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - height) / 2);
    const popup = window.open(
      authorizationUrl,
      'google-oauth-popup',
      `width=${String(width)},height=${String(height)},left=${String(left)},top=${String(top)},resizable=yes,scrollbars=yes`
    );
    if (!popup) {
      reject(new Error('Popup was blocked. Please allow popups for this site and try again.'));
      return;
    }

    const channel = expectedState ? new BroadcastChannel(`oauth_channel_${expectedState}`) : null;
    let completed = false;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      channel?.close();
      clearInterval(timer);
    };

    const process = (data: OAuthCallbackData) => {
      if (data.type !== 'OAUTH_CALLBACK' || completed) return;
      completed = true;
      cleanup();
      if (data.error || !data.code) {
        reject(new Error(data.error ?? 'No authorization code received from Google'));
      } else if (!expectedState || data.state !== expectedState) {
        reject(new Error('Invalid state token. Please try again.'));
      } else {
        resolve({ code: data.code, state: data.state });
      }
    };

    function handleMessage(event: MessageEvent<OAuthCallbackData>) {
      if (event.origin !== window.location.origin) return;
      process(event.data);
    }
    window.addEventListener('message', handleMessage);
    if (channel) {
      channel.onmessage = (event: MessageEvent<OAuthCallbackData>) => {
        process(event.data);
      };
    }

    const timer = setInterval(() => {
      try {
        if (popup.closed && !completed) {
          completed = true;
          cleanup();
          reject(new GoogleOAuthPopupClosedError());
        }
      } catch {
        // COOP policy blocks access while popup is on Google's domain — ignore
      }
    }, 500);
  });
}
