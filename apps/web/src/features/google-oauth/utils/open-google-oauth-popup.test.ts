import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleOAuthPopupClosedError, openGoogleOAuthPopup } from './open-google-oauth-popup';

const URL_WITH_STATE = 'https://accounts.google.com/o/oauth2/v2/auth?state=state-1';

describe('openGoogleOAuthPopup', () => {
  const popup = { closed: false, close: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
    popup.closed = false;
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        onmessage: unknown = null;
        close = vi.fn();
      }
    );
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const send = (data: Record<string, unknown>) => {
    window.dispatchEvent(new MessageEvent('message', { data, origin: window.location.origin }));
  };

  it('resolves with the code and state from the callback message', async () => {
    const result = openGoogleOAuthPopup(URL_WITH_STATE);
    send({ type: 'OAUTH_CALLBACK', code: 'code-1', state: 'state-1' });
    await expect(result).resolves.toEqual({ code: 'code-1', state: 'state-1' });
  });

  it('rejects a callback with another state', async () => {
    const result = openGoogleOAuthPopup(URL_WITH_STATE);
    send({ type: 'OAUTH_CALLBACK', code: 'code-1', state: 'other' });
    await expect(result).rejects.toThrow('Invalid state token');
  });

  it('rejects with the error forwarded by the popup', async () => {
    const result = openGoogleOAuthPopup(URL_WITH_STATE);
    send({ type: 'OAUTH_CALLBACK', error: 'OAuth error: access_denied' });
    await expect(result).rejects.toThrow('access_denied');
  });

  it('rejects when the popup is closed before the callback', async () => {
    const result = openGoogleOAuthPopup(URL_WITH_STATE);
    popup.closed = true;
    vi.advanceTimersByTime(600);
    await expect(result).rejects.toBeInstanceOf(GoogleOAuthPopupClosedError);
  });

  it('rejects when the browser blocks the popup', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(openGoogleOAuthPopup(URL_WITH_STATE)).rejects.toThrow('Popup was blocked');
  });
});
