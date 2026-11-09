import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MicrosoftAdsGoogleLoginButton } from './MicrosoftAdsGoogleLoginButton';

const REDIRECT_URI = `${window.location.origin}/oauth/microsoft-ads-google/callback`;

describe('MicrosoftAdsGoogleLoginButton', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks Google only who signed in, with a refresh token, and hands the code on', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({ closed: false } as unknown as Window);
    const onSuccess = vi.fn();
    render(
      <MicrosoftAdsGoogleLoginButton
        clientId='client-1'
        redirectUri={REDIRECT_URI}
        onSuccess={onSuccess}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    const url = new URL(open.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    const state = url.searchParams.get('state');
    expect(state).toBeTruthy();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          data: { type: 'MICROSOFT_ADS_GOOGLE_AUTH_SUCCESS', code: 'code-1', state },
        })
      );
    });

    expect(onSuccess).toHaveBeenCalledWith({ code: 'code-1' });
  });

  it('ignores the codes other sign-in buttons receive', () => {
    vi.spyOn(window, 'open').mockReturnValue({ closed: false } as unknown as Window);
    const onSuccess = vi.fn();
    render(
      <MicrosoftAdsGoogleLoginButton
        clientId='client-1'
        redirectUri={REDIRECT_URI}
        onSuccess={onSuccess}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          data: { type: 'GOOGLE_ADS_AUTH_SUCCESS', code: 'code-1', state: 'any' },
        })
      );
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });
});
