import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Credential } from '../types';
import { GoogleOAuthCredentialConnect } from './GoogleOAuthCredentialConnect';

const mocks = vi.hoisted(() => ({
  available: true as boolean | undefined,
  // What each client reports when the caller names one.
  clients: {} as Record<string, boolean>,
  authorize: vi.fn(),
  exchange: vi.fn(),
  popup: vi.fn(),
}));

vi.mock('../useCredentials', () => ({
  useGoogleOAuthAvailable: (client?: string) =>
    client ? (mocks.clients[client] ?? mocks.available) : mocks.available,
  useCredentialActions: () => ({
    authorizeGoogleOAuth: mocks.authorize,
    exchangeGoogleOAuth: mocks.exchange,
  }),
}));

vi.mock('react-hot-toast', () => {
  const toastMock = { error: vi.fn(), success: vi.fn() };
  return { default: toastMock, toast: toastMock };
});

const toasted = new Error('Request failed with status code 400');
vi.mock('../../../app/api', () => ({
  wasErrorToastShown: (error: unknown) => error === toasted,
}));

vi.mock('../../google-oauth/utils/open-google-oauth-popup', () => ({
  openGoogleOAuthPopup: mocks.popup,
  GoogleOAuthPopupClosedError: class extends Error {},
}));

const draft = { title: 'Team BigQuery', availableForUse: false, availableForMaintenance: false };
const created = { id: 'credential-1' } as Credential;

describe('GoogleOAuthCredentialConnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.available = true;
    mocks.clients = {};
    mocks.authorize.mockResolvedValue({
      authorizationUrl: 'https://accounts.google.com/auth?state=s',
    });
    mocks.popup.mockResolvedValue({ code: 'code-1', state: 's' });
    mocks.exchange.mockResolvedValue(created);
  });

  it('shows the connect button in a card with the permissions it requests', () => {
    render(
      <GoogleOAuthCredentialConnect
        credential={null}
        definitionId='google-oauth'
        draft={draft}
        onConnected={vi.fn()}
      />
    );
    const card = screen
      .getByRole('button', { name: 'Connect with Google' })
      .closest('[data-slot="form-item"]');

    expect(card).not.toBeNull();
    expect(card).toHaveTextContent('Connect with Google OAuth');
    expect(card).toHaveTextContent('What permissions will be requested?');
  });

  it('follows the OAuth client the definition names', () => {
    mocks.available = false;
    mocks.clients = { destination: true };
    render(
      <GoogleOAuthCredentialConnect
        credential={null}
        definitionId='google-sheets-oauth'
        client='destination'
        draft={draft}
        onConnected={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Connect with Google' })).toBeInTheDocument();
  });

  it('exchanges the code with the form title and sharing, then reports the Credential', async () => {
    const onConnected = vi.fn();
    render(
      <GoogleOAuthCredentialConnect
        credential={null}
        definitionId='google-oauth'
        draft={draft}
        onConnected={onConnected}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Connect with Google' }));

    await waitFor(() => {
      expect(onConnected).toHaveBeenCalledWith(created);
    });
    expect(mocks.authorize).toHaveBeenCalledWith({
      redirectUri: `${window.location.origin}/oauth/google/callback`,
      definitionId: 'google-oauth',
    });
    expect(mocks.exchange).toHaveBeenCalledWith({
      code: 'code-1',
      state: 's',
      title: 'Team BigQuery',
      availableForUse: false,
      availableForMaintenance: false,
    });
  });

  it('shows the message of a failure that is not an API error', async () => {
    mocks.popup.mockRejectedValue(
      new Error('Popup was blocked. Please allow popups for this site and try again.')
    );
    render(
      <GoogleOAuthCredentialConnect
        credential={null}
        definitionId='google-oauth'
        draft={draft}
        onConnected={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Connect with Google' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Popup was blocked. Please allow popups for this site and try again.'
      );
    });
  });

  it('shows a connect failure inline, without a toast, when asked to', async () => {
    mocks.popup.mockRejectedValue(new Error('Popup was blocked.'));
    render(
      <GoogleOAuthCredentialConnect
        credential={null}
        definitionId='google-sheets-oauth'
        draft={draft}
        onConnected={vi.fn()}
        variant='quick-connect'
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Connect with Google' }));

    expect(await screen.findByText('Popup was blocked.')).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('on the quick-connect page, shows main text for a message-less failure and never toasts a reported one', async () => {
    mocks.exchange.mockRejectedValue(toasted);
    mocks.popup.mockResolvedValue({ code: 'c', state: 's' });
    render(
      <GoogleOAuthCredentialConnect
        credential={null}
        definitionId='google-sheets-oauth'
        draft={draft}
        onConnected={vi.fn()}
        variant='quick-connect'
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Connect with Google' }));

    expect(await screen.findByText('Request failed with status code 400')).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    expect(mocks.exchange).toHaveBeenCalledWith(expect.objectContaining({ skipErrorToast: true }));
  });

  it('on the quick-connect page, uses main spacing, a disabled button while loading and no reconnect line', () => {
    mocks.available = undefined;
    const { container, rerender } = render(
      <GoogleOAuthCredentialConnect
        credential={null}
        definitionId='google-sheets-oauth'
        draft={draft}
        onConnected={vi.fn()}
        variant='quick-connect'
      />
    );
    expect(screen.getByRole('button', { name: 'Connect with Google' })).toBeDisabled();
    expect(container.querySelector('.mb-4')).toBeNull();

    mocks.available = true;
    const rejected = {
      id: 'c',
      identity: 'ann@example.com',
      validationState: 'rejected',
      publicMetadata: { account: { email: 'ann@example.com' }, scopes: [] },
    } as unknown as Credential;
    rerender(
      <GoogleOAuthCredentialConnect
        credential={rejected}
        definitionId='google-sheets-oauth'
        draft={draft}
        onConnected={vi.fn()}
        variant='quick-connect'
      />
    );
    expect(screen.queryByText(/A different Google account is refused/)).toBeNull();
  });

  it('hides the help, swaps the tooltip and shows the authenticated email when asked to', () => {
    const credential = {
      id: 'credential-9',
      identity: 'ann@example.com',
      publicMetadata: { account: { email: 'ann@example.com', name: 'Ann Lee' }, scopes: [] },
    } as unknown as Credential;
    const props = { credential, definitionId: 'google-sheets-oauth', draft, onConnected: vi.fn() };
    const { rerender } = render(<GoogleOAuthCredentialConnect {...props} />);
    expect(screen.getByText('What is this for?')).toBeInTheDocument();
    expect(screen.queryByText('Authenticated email')).not.toBeInTheDocument();

    rerender(<GoogleOAuthCredentialConnect {...props} variant='quick-connect' />);

    expect(screen.queryByText('What is this for?')).not.toBeInTheDocument();
    expect(screen.getByText('Authenticated email')).toBeInTheDocument();
    expect(screen.getByText('ann@example.com')).toBeInTheDocument();
  });

  it('on the quick-connect page, reconnects the Credential it shows instead of creating another', async () => {
    const onConnected = vi.fn();
    const kept = {
      id: 'credential-9',
      identity: 'ann@example.com',
      publicMetadata: { account: { email: 'ann@example.com', name: 'Ann Lee' }, scopes: [] },
    } as unknown as Credential;
    mocks.exchange.mockResolvedValue(kept);
    render(
      <GoogleOAuthCredentialConnect
        credential={kept}
        definitionId='google-sheets-oauth'
        draft={draft}
        onConnected={onConnected}
        variant='quick-connect'
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Authenticated as Ann Lee' }));

    await waitFor(() => {
      expect(onConnected).toHaveBeenCalledWith(kept);
    });
    expect(mocks.authorize).toHaveBeenCalledWith({
      redirectUri: `${window.location.origin}/oauth/google/callback`,
      definitionId: 'google-sheets-oauth',
      credentialId: 'credential-9',
      skipErrorToast: true,
    });
    expect(mocks.exchange).toHaveBeenCalledWith({
      code: 'code-1',
      state: 's',
      skipErrorToast: true,
    });
  });

  it('does not report again a failed exchange the API client already reported', async () => {
    mocks.exchange.mockRejectedValue(toasted);
    render(
      <GoogleOAuthCredentialConnect
        credential={null}
        definitionId='google-oauth'
        draft={draft}
        onConnected={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Connect with Google' }));

    await waitFor(() => {
      expect(mocks.exchange).toHaveBeenCalled();
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('is hidden when Google sign-in is not set up', () => {
    mocks.available = false;
    const { container } = render(
      <GoogleOAuthCredentialConnect
        credential={null}
        definitionId='google-oauth'
        draft={draft}
        onConnected={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps the account but blocks reconnecting when sign-in is not set up', () => {
    mocks.available = false;
    const credential = { id: 'c', identity: 'ann@example.com' } as Credential;
    render(
      <GoogleOAuthCredentialConnect
        credential={credential}
        definitionId='google-oauth'
        draft={draft}
        onConnected={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Authenticated as ann@example.com' })).toBeDisabled();
  });

  it('shows the connected account and reconnects that Credential', async () => {
    const onConnected = vi.fn();
    const credential = {
      id: 'credential-9',
      identity: 'ann@example.com',
      publicMetadata: {
        account: { email: 'ann@example.com', name: 'Ann Lee', picture: null },
        scopes: [],
      },
    } as unknown as Credential;
    render(
      <GoogleOAuthCredentialConnect
        credential={credential}
        definitionId='google-oauth'
        draft={draft}
        onConnected={onConnected}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Authenticated as Ann Lee' }));

    await waitFor(() => {
      expect(onConnected).toHaveBeenCalled();
    });
    expect(mocks.authorize).toHaveBeenCalledWith({
      redirectUri: `${window.location.origin}/oauth/google/callback`,
      credentialId: 'credential-9',
      definitionId: 'google-oauth',
    });
    expect(mocks.exchange).toHaveBeenCalledWith({ code: 'code-1', state: 's' });
  });

  it('blocks reconnecting while the form has unsaved edits', () => {
    const credential = { id: 'c', identity: 'ann@example.com' } as Credential;
    render(
      <GoogleOAuthCredentialConnect
        credential={credential}
        definitionId='google-oauth'
        disabled
        draft={draft}
        onConnected={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Authenticated as ann@example.com' })).toBeDisabled();
  });

  it('offers Connect with Google again when the saved grant was rejected', () => {
    const credential = {
      id: 'c',
      identity: 'ann@example.com',
      validationState: 'rejected',
    } as Credential;
    render(
      <GoogleOAuthCredentialConnect
        credential={credential}
        definitionId='google-oauth'
        draft={draft}
        onConnected={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Connect with Google' })).toBeEnabled();
  });

  it('treats a saved grant with an empty account email as connected', () => {
    const credential = {
      id: 'c',
      identity: null,
      validationState: 'verified',
      publicMetadata: { account: { email: '', name: '', picture: null }, scopes: [] },
    } as unknown as Credential;
    render(
      <GoogleOAuthCredentialConnect
        credential={credential}
        definitionId='google-oauth'
        draft={draft}
        onConnected={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Authenticated as Google account' })).toBeEnabled();
  });

  it('names the account to reconnect with when the saved grant was rejected', () => {
    const credential = {
      id: 'c',
      identity: 'jane@example.com',
      validationState: 'rejected',
    } as Credential;
    render(
      <GoogleOAuthCredentialConnect
        credential={credential}
        definitionId='google-oauth'
        draft={draft}
        onConnected={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Connect with Google' })).toBeEnabled();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent ===
            'Reconnect with jane@example.com. A different Google account is refused.'
      )
    ).toBeInTheDocument();
  });

  it('says sign-in is not configured when a connected grant cannot be renewed', () => {
    mocks.available = false;
    const credential = {
      id: 'c',
      identity: 'ann@example.com',
      validationState: 'verified',
    } as Credential;
    render(
      <GoogleOAuthCredentialConnect
        credential={credential}
        definitionId='google-oauth'
        draft={draft}
        onConnected={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Authenticated as ann@example.com' })).toBeDisabled();
    expect(
      screen.getByText('Google sign-in is not configured on this server.')
    ).toBeInTheDocument();
  });

  it('says sign-in is not configured when a rejected grant cannot be reconnected', () => {
    mocks.available = false;
    const credential = {
      id: 'c',
      identity: 'ann@example.com',
      validationState: 'rejected',
    } as Credential;
    render(
      <GoogleOAuthCredentialConnect
        credential={credential}
        definitionId='google-oauth'
        draft={draft}
        onConnected={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('button', { name: /Connect with Google|Authenticated as/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Google sign-in is not configured on this server.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/Reconnect with/)).not.toBeInTheDocument();
  });

  it('does not offer to reconnect a rejected grant while sign-in availability loads', () => {
    mocks.available = undefined;
    const credential = {
      id: 'c',
      identity: 'ann@example.com',
      validationState: 'rejected',
    } as Credential;
    render(
      <GoogleOAuthCredentialConnect
        credential={credential}
        definitionId='google-oauth'
        draft={draft}
        onConnected={vi.fn()}
      />
    );
    expect(screen.queryByText(/Reconnect with/)).not.toBeInTheDocument();
  });
});
