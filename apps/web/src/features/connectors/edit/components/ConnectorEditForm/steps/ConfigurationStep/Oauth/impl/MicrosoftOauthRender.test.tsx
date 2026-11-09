import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OauthRenderComponentProps } from '../OauthRenderFactory';
import { MicrosoftOauthRender } from './MicrosoftOauthRender';

vi.mock('../../../../../../../shared/components/MicrosoftLoginButton', () => ({
  MicrosoftLoginButton: ({
    children,
    onSuccess,
  }: {
    children?: React.ReactNode;
    onSuccess: (response: { code: string }) => void;
  }) => (
    <button
      type='button'
      data-testid='microsoft-login'
      onClick={() => {
        onSuccess({ code: 'microsoft-code' });
      }}
    >
      {children}
    </button>
  ),
}));

vi.mock('../../../../../../../shared/components/MicrosoftAdsGoogleLoginButton', () => ({
  MicrosoftAdsGoogleLoginButton: ({
    children,
    onSuccess,
  }: {
    children?: React.ReactNode;
    onSuccess: (response: { code: string }) => void;
  }) => (
    <button
      type='button'
      data-testid='google-login'
      onClick={() => {
        onSuccess({ code: 'google-code' });
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
  GoogleRedirectUri: 'https://app.example.com/oauth/microsoft-ads-google/callback',
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
  it('offers only Microsoft, as before, when the server has no Google client', () => {
    renderMicrosoftOAuth({
      settings: { isEnabled: true, vars: MICROSOFT_VARS },
      status: { valid: true, user: { id: '42', name: 'advertiser@example.com' } },
    });

    expect(screen.queryByTestId('google-login')).toBeNull();
    expect(screen.getByTestId('microsoft-login').textContent).toBe(
      'Connected as advertiser@example.com'
    );
  });

  it('offers Google next to Microsoft and marks the code as a Google sign-in', () => {
    const props = renderMicrosoftOAuth();

    expect(screen.getByTestId('microsoft-login').textContent).toBe('Sign in with Microsoft');
    fireEvent.click(screen.getByTestId('google-login'));
    fireEvent.click(screen.getByTestId('microsoft-login'));

    expect(props.onOAuthSuccess).toHaveBeenNthCalledWith(1, {
      code: 'google-code',
      identityProvider: 'google',
    });
    expect(props.onOAuthSuccess).toHaveBeenNthCalledWith(2, { code: 'microsoft-code' });
  });

  it('names the connected user once, above both buttons', () => {
    renderMicrosoftOAuth({
      status: { valid: true, user: { id: '42', name: 'advertiser@gmail.com' } },
    });

    expect(screen.getByText('advertiser@gmail.com').closest('p')?.textContent).toBe(
      'Connected as advertiser@gmail.com'
    );
    expect(screen.getByTestId('microsoft-login').textContent).toBe('Sign in with Microsoft');
    expect(screen.getByTestId('google-login').textContent).toBe('Sign in with Google');
  });
});
