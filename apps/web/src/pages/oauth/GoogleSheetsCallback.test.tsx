import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleSheetsCallback } from './GoogleSheetsCallback';
import { TikTokCallback } from './TikTokCallback';

const CALLBACK_PATH = '/oauth/google-sheets/callback';

describe('GoogleSheetsCallback', () => {
  let postMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    postMessage = vi.fn();
    Object.defineProperty(window, 'opener', {
      value: { postMessage },
      writable: true,
      configurable: true,
    });
    vi.spyOn(window, 'close').mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.defineProperty(window, 'opener', { value: null, writable: true, configurable: true });
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('reads the code and token from the fragment, clears it, then posts both to the opener', () => {
    window.history.replaceState(
      null,
      '',
      `${CALLBACK_PATH}#state=state-1&code=code-1&access_token=token-1&expires_in=3599`
    );
    const replaceState = vi.spyOn(window.history, 'replaceState');

    render(
      <MemoryRouter initialEntries={[CALLBACK_PATH]}>
        <GoogleSheetsCallback />
      </MemoryRouter>
    );

    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe(CALLBACK_PATH);
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'GOOGLE_SHEETS_AUTH_SUCCESS',
        state: 'state-1',
        code: 'code-1',
        accessToken: 'token-1',
      },
      window.location.origin
    );
    expect(replaceState.mock.invocationCallOrder[0]).toBeLessThan(
      postMessage.mock.invocationCallOrder[0]
    );
  });

  it('reports an error from the fragment and clears it', () => {
    window.history.replaceState(null, '', `${CALLBACK_PATH}#error=access_denied&state=state-1`);

    render(
      <MemoryRouter initialEntries={[CALLBACK_PATH]}>
        <GoogleSheetsCallback />
      </MemoryRouter>
    );

    expect(window.location.hash).toBe('');
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'GOOGLE_SHEETS_AUTH_ERROR', error: 'access_denied' },
      window.location.origin
    );
  });

  it('refuses a fragment without an access token', () => {
    window.history.replaceState(null, '', `${CALLBACK_PATH}#state=state-1&code=code-1`);

    render(
      <MemoryRouter initialEntries={[CALLBACK_PATH]}>
        <GoogleSheetsCallback />
      </MemoryRouter>
    );

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'GOOGLE_SHEETS_AUTH_ERROR', error: 'No authorization data received from provider' },
      window.location.origin
    );
  });

  it('leaves other providers on the query string', () => {
    render(
      <MemoryRouter initialEntries={['/oauth/tiktok/callback?auth_code=tt-1&state=state-1']}>
        <TikTokCallback />
      </MemoryRouter>
    );

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'TIKTOK_AUTH_SUCCESS', state: 'state-1', authCode: 'tt-1' },
      window.location.origin
    );
  });
});
