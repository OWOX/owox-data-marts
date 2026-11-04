import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleSheetsLoginButton } from './GoogleSheetsLoginButton';

const REDIRECT_URI = `${window.location.origin}/oauth/google-sheets/callback`;

describe('GoogleSheetsLoginButton', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks Google for a code and a token in one popup and hands both on', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({ closed: false } as unknown as Window);
    const onSuccess = vi.fn();
    render(
      <GoogleSheetsLoginButton
        clientId='client-1'
        redirectUri={REDIRECT_URI}
        onSuccess={onSuccess}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    const url = new URL(open.mock.calls[0][0] as string);
    expect(url.searchParams.get('response_type')).toBe('code token');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    const state = url.searchParams.get('state');
    expect(state).toBeTruthy();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          data: {
            type: 'GOOGLE_SHEETS_AUTH_SUCCESS',
            code: 'code-1',
            accessToken: 'token-1',
            state,
          },
        })
      );
    });

    expect(onSuccess).toHaveBeenCalledWith({ code: 'code-1', accessToken: 'token-1' });
  });
});
