import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GoogleOAuthConnectButton } from './GoogleOAuthConnectButton';
import { destinationOAuthApi, storageOAuthApi } from '../api/google-oauth-api.service';

vi.mock('../api/google-oauth-api.service', () => ({
  storageOAuthApi: {
    generateAuthUrl: vi.fn(),
    exchangeOAuthCode: vi.fn(),
    getOAuthStatus: vi.fn(),
  },
  destinationOAuthApi: {
    generateAuthUrl: vi.fn(),
    generateStandaloneAuthUrl: vi.fn(),
    exchangeOAuthCode: vi.fn(),
    getOAuthStatus: vi.fn(),
    getCredentialStatus: vi.fn(),
  },
}));

const STATE = 'state-jwt-1';

describe('GoogleOAuthConnectButton', () => {
  let windowOpen: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    class MockBroadcastChannel {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage = vi.fn();
      close = vi.fn();
    }
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
    windowOpen = vi
      .spyOn(window, 'open')
      .mockReturnValue({ closed: false, close: vi.fn() } as unknown as Window);
    vi.mocked(destinationOAuthApi.generateStandaloneAuthUrl).mockResolvedValue({
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=' + STATE,
      state: STATE,
    });
    vi.mocked(storageOAuthApi.generateAuthUrl).mockResolvedValue({
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=' + STATE,
      state: STATE,
    });
    vi.mocked(storageOAuthApi.getOAuthStatus).mockResolvedValue({ isValid: false });
  });

  afterEach(() => {
    windowOpen.mockRestore();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  async function connectAndReceive(message: Record<string, unknown>) {
    fireEvent.click(await screen.findByRole('button', { name: /Connect with Google/ }));
    await waitFor(() => {
      expect(windowOpen).toHaveBeenCalled();
    });
    fireEvent(
      window,
      new MessageEvent('message', { data: message, origin: window.location.origin })
    );
  }

  it('exchanges the forwarded code in the opener window and reports success', async () => {
    vi.mocked(destinationOAuthApi.exchangeOAuthCode).mockResolvedValue({
      credentialId: 'cred-1',
      user: { id: 'u1', email: 'user@example.com' },
    });
    vi.mocked(destinationOAuthApi.getCredentialStatus).mockResolvedValue({
      isValid: true,
      credentialId: 'cred-1',
      user: { email: 'user@example.com' },
    });
    const onSuccess = vi.fn();

    render(<GoogleOAuthConnectButton resourceType='destination' onSuccess={onSuccess} />);
    await connectAndReceive({ type: 'OAUTH_CALLBACK', code: 'auth-code-1', state: STATE });

    await waitFor(() => {
      expect(destinationOAuthApi.exchangeOAuthCode).toHaveBeenCalledWith('auth-code-1', STATE);
      expect(onSuccess).toHaveBeenCalledWith('cred-1');
    });
  });

  it('uses the storage API for storage resources', async () => {
    vi.mocked(storageOAuthApi.exchangeOAuthCode).mockResolvedValue({
      credentialId: 'cred-2',
      user: { id: 'u1', email: 'user@example.com' },
    });
    const onSuccess = vi.fn();

    render(
      <GoogleOAuthConnectButton
        resourceType='storage'
        resourceId='storage-1'
        onSuccess={onSuccess}
      />
    );
    await connectAndReceive({ type: 'OAUTH_CALLBACK', code: 'auth-code-2', state: STATE });

    await waitFor(() => {
      expect(storageOAuthApi.exchangeOAuthCode).toHaveBeenCalledWith('auth-code-2', STATE);
      expect(onSuccess).toHaveBeenCalledWith('cred-2');
    });
  });

  it('rejects a callback whose state does not match the one generated for this attempt', async () => {
    const onSuccess = vi.fn();

    render(<GoogleOAuthConnectButton resourceType='destination' onSuccess={onSuccess} />);
    await connectAndReceive({ type: 'OAUTH_CALLBACK', code: 'auth-code-1', state: 'other-state' });

    expect(await screen.findByText(/Invalid state token/)).toBeInTheDocument();
    expect(destinationOAuthApi.exchangeOAuthCode).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('shows the error forwarded by the popup', async () => {
    render(<GoogleOAuthConnectButton resourceType='destination' />);
    await connectAndReceive({ type: 'OAUTH_CALLBACK', error: 'OAuth error: access_denied' });

    expect(await screen.findByText(/access_denied/)).toBeInTheDocument();
    expect(destinationOAuthApi.exchangeOAuthCode).not.toHaveBeenCalled();
  });

  it('shows the exchange failure message when the API call fails', async () => {
    vi.mocked(destinationOAuthApi.exchangeOAuthCode).mockRejectedValue(
      new Error('OAuth state does not belong to your project')
    );

    render(<GoogleOAuthConnectButton resourceType='destination' />);
    await connectAndReceive({ type: 'OAUTH_CALLBACK', code: 'auth-code-1', state: STATE });

    expect(await screen.findByText(/does not belong to your project/)).toBeInTheDocument();
  });
});
