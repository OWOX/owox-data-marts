import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OauthRenderComponentProps } from '../OauthRenderFactory';
import { MicrosoftOauthRender } from './MicrosoftOauthRender';

const { openGoogleOAuthPopup } = vi.hoisted(() => ({
  openGoogleOAuthPopup: vi.fn<(url: string) => Promise<{ code: string; state: string }>>(),
}));

vi.mock(
  '../../../../../../../../google-oauth/utils/open-google-oauth-popup',
  async importOriginal => ({
    ...(await importOriginal<
      typeof import('../../../../../../../../google-oauth/utils/open-google-oauth-popup')
    >()),
    openGoogleOAuthPopup,
  })
);

vi.mock('../../../../../../../shared/components/MicrosoftLoginButton', () => ({
  MicrosoftLoginButton: ({
    children,
    disabled,
    onSuccess,
  }: {
    children?: React.ReactNode;
    disabled?: boolean;
    onSuccess: (response: { code: string }) => void;
  }) => (
    <button
      type='button'
      data-testid='microsoft-login'
      disabled={disabled}
      onClick={() => {
        onSuccess({ code: 'microsoft-code' });
      }}
    >
      {children}
    </button>
  ),
}));

const MICROSOFT_VARS = {
  ClientId: 'microsoft-client',
  RedirectUri: 'https://app.example.com/oauth/microsoft-ads/callback',
};
const GOOGLE_VARS = {
  ...MICROSOFT_VARS,
  GoogleClientId: 'google-client.apps.googleusercontent.com',
  // The shared callback page on the app's own origin
  GoogleRedirectUri: `${window.location.origin}/oauth/google/callback`,
};

function renderMicrosoftOAuth(overrides: Partial<OauthRenderComponentProps> = {}) {
  const props = {
    isLoading: false,
    status: null,
    settings: { isEnabled: true, vars: GOOGLE_VARS },
    onOAuthSuccess: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as Pick<OauthRenderComponentProps, 'isLoading' | 'status' | 'settings' | 'onOAuthSuccess'>;

  render(<MicrosoftOauthRender {...props} />);
  return props;
}

describe('MicrosoftOauthRender', () => {
  beforeEach(() => {
    openGoogleOAuthPopup.mockReset();
  });

  it('offers only Microsoft, as before, when the server has no Google client', () => {
    renderMicrosoftOAuth({
      settings: { isEnabled: true, vars: MICROSOFT_VARS },
      status: { valid: true, user: { id: '42', name: 'advertiser@example.com' } },
    });

    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();
    expect(screen.getByTestId('microsoft-login').textContent).toBe(
      'Connected as advertiser@example.com'
    );
  });

  it('signs in with Google in the shared popup and marks the code as a Google sign-in', async () => {
    openGoogleOAuthPopup.mockResolvedValue({ code: 'google-code', state: 'state' });
    const props = renderMicrosoftOAuth();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    await waitFor(() => {
      expect(props.onOAuthSuccess).toHaveBeenCalledWith({
        code: 'google-code',
        identityProvider: 'google',
      });
    });
    const url = new URL(openGoogleOAuthPopup.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(GOOGLE_VARS.GoogleClientId);
    expect(url.searchParams.get('redirect_uri')).toBe(GOOGLE_VARS.GoogleRedirectUri);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  it('still signs in with Microsoft next to Google', () => {
    const props = renderMicrosoftOAuth();

    expect(screen.getByTestId('microsoft-login').textContent).toBe('Sign in with Microsoft');
    fireEvent.click(screen.getByTestId('microsoft-login'));

    expect(props.onOAuthSuccess).toHaveBeenCalledWith({ code: 'microsoft-code' });
  });

  it('keeps Sign in with Microsoft disabled while the Google window is open', async () => {
    let finishGoogle: (value: { code: string; state: string }) => void = () => undefined;
    openGoogleOAuthPopup.mockReturnValue(
      new Promise(resolve => {
        finishGoogle = resolve;
      })
    );
    renderMicrosoftOAuth();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    await waitFor(() => {
      expect(screen.getByTestId('microsoft-login')).toHaveProperty('disabled', true);
    });
    finishGoogle({ code: 'google-code', state: 'state' });
    await waitFor(() => {
      expect(screen.getByTestId('microsoft-login')).toHaveProperty('disabled', false);
    });
  });

  it('names the address Sign in with Google is set up for when the page is opened elsewhere', async () => {
    const props = renderMicrosoftOAuth({
      settings: {
        isEnabled: true,
        vars: {
          ...GOOGLE_VARS,
          GoogleRedirectUri: 'https://app.example.com/oauth/google/callback',
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    expect(
      await screen.findByText(
        'Sign in with Google is set up for https://app.example.com. Open this page there to sign in with Google.'
      )
    ).toBeTruthy();
    expect(openGoogleOAuthPopup).not.toHaveBeenCalled();
    expect(props.onOAuthSuccess).not.toHaveBeenCalled();
  });

  it('names the connected user once, above both buttons, with the valid mark', () => {
    renderMicrosoftOAuth({
      status: { valid: true, user: { id: '42', name: 'advertiser@gmail.com' } },
    });

    const line = screen.getByText('advertiser@gmail.com').closest('p');
    expect(line?.textContent).toBe('Connected as advertiser@gmail.com');
    expect(line?.querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('microsoft-login').textContent).toBe('Sign in with Microsoft');
  });

  it('says nothing when the Google window is closed and shows other popup errors', async () => {
    const { GoogleOAuthPopupClosedError } =
      await import('../../../../../../../../google-oauth/utils/open-google-oauth-popup');
    openGoogleOAuthPopup.mockRejectedValueOnce(new GoogleOAuthPopupClosedError());
    openGoogleOAuthPopup.mockRejectedValueOnce(new Error('Popup was blocked.'));
    const props = renderMicrosoftOAuth();
    const button = screen.getByRole('button', { name: 'Sign in with Google' });

    fireEvent.click(button);
    await waitFor(() => {
      expect(openGoogleOAuthPopup).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('The Google sign-in window was closed')).toBeNull();

    fireEvent.click(button);
    expect(await screen.findByText('Popup was blocked.')).toBeTruthy();
    expect(props.onOAuthSuccess).not.toHaveBeenCalled();
  });
});
