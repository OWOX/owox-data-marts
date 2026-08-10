import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GoogleOAuthCallbackPage } from './GoogleOAuthCallbackPage';

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <GoogleOAuthCallbackPage />
    </MemoryRouter>
  );
}

describe('GoogleOAuthCallbackPage', () => {
  let postMessage: ReturnType<typeof vi.fn>;
  let windowClose: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    postMessage = vi.fn();
    Object.defineProperty(window, 'opener', {
      value: { postMessage },
      writable: true,
      configurable: true,
    });
    windowClose = vi.spyOn(window, 'close').mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.defineProperty(window, 'opener', {
      value: null,
      writable: true,
      configurable: true,
    });
    windowClose.mockRestore();
  });

  it('forwards code and state to the opener without calling any API', () => {
    renderAt('/oauth/google/callback?code=auth-code-1&state=state-jwt-1');

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'OAUTH_CALLBACK', code: 'auth-code-1', state: 'state-jwt-1' },
      window.location.origin
    );
    expect(windowClose).toHaveBeenCalled();
  });

  it('forwards a provider error to the opener', () => {
    renderAt('/oauth/google/callback?error=access_denied');

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'OAUTH_CALLBACK', error: 'OAuth error: access_denied' },
      window.location.origin
    );
  });

  it('reports a missing authorization code to the opener', () => {
    renderAt('/oauth/google/callback?state=state-jwt-1');

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'OAUTH_CALLBACK', error: 'Missing authorization code or state' },
      window.location.origin
    );
  });

  it('falls back to a BroadcastChannel when the opener is unavailable', () => {
    Object.defineProperty(window, 'opener', {
      value: null,
      writable: true,
      configurable: true,
    });
    const channelPostMessage = vi.fn();
    const channelClose = vi.fn();
    const channelNames: string[] = [];
    class MockBroadcastChannel {
      postMessage = channelPostMessage;
      close = channelClose;
      constructor(name: string) {
        channelNames.push(name);
      }
    }
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);

    try {
      renderAt('/oauth/google/callback?code=auth-code-1&state=state-jwt-1');

      expect(channelNames).toContain('oauth_channel_state-jwt-1');
      expect(channelPostMessage).toHaveBeenCalledWith({
        type: 'OAUTH_CALLBACK',
        code: 'auth-code-1',
        state: 'state-jwt-1',
      });
      expect(channelClose).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows a fallback message when neither opener nor state is available', () => {
    Object.defineProperty(window, 'opener', {
      value: null,
      writable: true,
      configurable: true,
    });

    renderAt('/oauth/google/callback?code=auth-code-1');

    expect(screen.getByText(/Missing authorization code/)).toBeInTheDocument();
  });
});
