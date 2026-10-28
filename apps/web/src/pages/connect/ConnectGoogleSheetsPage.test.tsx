import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectGoogleSheetsPage } from './ConnectGoogleSheetsPage';
import { ConnectGoogleSheetsDonePage } from './ConnectGoogleSheetsDonePage';
import { dataDestinationService } from '../../features/data-destination/shared';

// Real react-router navigation (not just a recorder) so the assertions below can verify
// the actual /done route renders after a successful save, matching this app's established
// test pattern of mocking `useProjectRoute` rather than wrapping pages in a full AuthProvider.
vi.mock('../../shared/hooks', () => ({
  useProjectRoute: () => {
    const navigate = useNavigate();
    return {
      navigate: (path: string, options?: { replace?: boolean }) =>
        navigate(`/ui/project-1${path}`, options),
      scope: (path: string) => `/ui/project-1${path}`,
      projectId: 'project-1',
    };
  },
}));

const connectedAccount = (id: string, identity: string) => ({
  id,
  identity,
  definition: { id: 'google-sheets-oauth' },
});

const oauth = vi.hoisted(() => ({
  available: true as boolean | undefined,
  connectProps: [] as Record<string, unknown>[],
  // The Credential the next connect creates.
  connected: null as unknown,
}));

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('../../utils/data-layer', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args) as unknown,
}));

vi.mock('../../features/credentials', async () => ({
  // The real report, so the event is the one the Destination form sends.
  trackCredentialCreated: (
    await vi.importActual<typeof import('../../features/credentials/track-credential-created')>(
      '../../features/credentials/track-credential-created'
    )
  ).trackCredentialCreated,
  useGoogleOAuthAvailable: (client?: string) => (client === 'destination' ? oauth.available : true),
  GoogleOAuthCredentialConnect: (props: { onConnected: (credential: unknown) => void }) => {
    oauth.connectProps.push(props);
    return (
      <button
        type='button'
        onClick={() => {
          props.onConnected(oauth.connected);
        }}
      >
        Connect with Google (mock)
      </button>
    );
  },
}));

vi.mock('../../features/data-destination/shared', async () => {
  const actual = await vi.importActual<typeof import('../../features/data-destination/shared')>(
    '../../features/data-destination/shared'
  );
  return {
    ...actual,
    dataDestinationService: { createConnectGoogleSheetsDestination: vi.fn() },
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/ui/project-1/connect/google-sheets']}>
      <Routes>
        <Route path='/ui/:projectId/connect/google-sheets' element={<ConnectGoogleSheetsPage />} />
        <Route
          path='/ui/:projectId/connect/google-sheets/done'
          element={<ConnectGoogleSheetsDonePage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ConnectGoogleSheetsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('close', vi.fn());
    oauth.available = true;
    oauth.connectProps = [];
    oauth.connected = connectedAccount('credential-1', 'user@example.com');
    vi.mocked(dataDestinationService.createConnectGoogleSheetsDestination).mockResolvedValue({
      id: 'destination-1',
    } as never);
  });

  it('starts the Title field with the plain default — never pre-filled from the URL', async () => {
    renderPage();

    expect(await screen.findByDisplayValue('Google Sheets')).toBeInTheDocument();
  });

  it('creates the destination automatically once Google access is granted, without a Save button', async () => {
    renderPage();

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();

    const titleInput = await screen.findByDisplayValue('Google Sheets');
    fireEvent.change(titleInput, { target: { value: 'My Google Sheets' } });
    await waitFor(() => {
      expect(titleInput).toHaveValue('My Google Sheets');
    });
    (await screen.findByText('Connect with Google (mock)')).click();

    await waitFor(() => {
      expect(dataDestinationService.createConnectGoogleSheetsDestination).toHaveBeenCalledWith({
        title: 'My Google Sheets',
        reusableCredentialId: 'credential-1',
      });
    });
  });

  it('connects a Sheets Google account Credential that is not shared', async () => {
    renderPage();

    await screen.findByText('Connect with Google (mock)');

    expect(oauth.connectProps.at(-1)).toMatchObject({
      credential: null,
      definitionId: 'google-sheets-oauth',
      client: 'destination',
      draft: { availableForUse: false, availableForMaintenance: false },
    });
  });

  it('keeps the quick-connect look of the page: no help, inline errors, authenticated email', async () => {
    renderPage();

    await screen.findByText('Connect with Google (mock)');

    expect(oauth.connectProps[0]).toMatchObject({
      variant: 'quick-connect',
    });
  });

  it('explains that the page cannot be used without the Destination OAuth client', async () => {
    oauth.available = false;
    renderPage();

    expect(
      await screen.findByText(/Google OAuth isn.t configured for this OWOX instance/)
    ).toBeInTheDocument();
    expect(screen.queryByText('Connect with Google (mock)')).not.toBeInTheDocument();
  });

  it('appends the connected Google account email to the untouched default title', async () => {
    renderPage();

    (await screen.findByText('Connect with Google (mock)')).click();

    await waitFor(() => {
      expect(dataDestinationService.createConnectGoogleSheetsDestination).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Google Sheets (user@example.com)' })
      );
    });
  });

  it('does not append an email to a title typed by hand', async () => {
    renderPage();

    const titleInput = await screen.findByDisplayValue('Google Sheets');
    fireEvent.change(titleInput, { target: { value: 'My Google Sheets' } });
    await waitFor(() => {
      expect(titleInput).toHaveValue('My Google Sheets');
    });
    (await screen.findByText('Connect with Google (mock)')).click();

    await waitFor(() => {
      expect(dataDestinationService.createConnectGoogleSheetsDestination).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'My Google Sheets' })
      );
    });
  });

  it('tries to close the tab, then navigates to the dedicated confirmation route once created', async () => {
    renderPage();

    (await screen.findByText('Connect with Google (mock)')).click();

    // The confirmation route shows a generic message — not the title, which came from an
    // untrusted query param and can't be treated as proof of what was actually created.
    expect(
      await screen.findByText(/your google sheets destination was created successfully/i)
    ).toBeInTheDocument();
    expect(await screen.findByText(/you can close this tab now/i)).toBeInTheDocument();
    expect(window.close).toHaveBeenCalledTimes(1);
    // The form itself is gone — we're on the /done route now, not just showing local state,
    // so a refresh here can never re-render the connect form and risk a duplicate create.
    expect(screen.queryByText('Connect with Google (mock)')).not.toBeInTheDocument();
  });

  it('shows a blurred overlay with a loading message while the destination is being created', async () => {
    let resolveCreate: (value: { id: string }) => void = () => undefined;
    vi.mocked(dataDestinationService.createConnectGoogleSheetsDestination).mockReturnValue(
      new Promise(resolve => {
        resolveCreate = resolve;
      }) as never
    );

    renderPage();

    (await screen.findByText('Connect with Google (mock)')).click();

    const overlay = await screen.findByTestId('saving-overlay');
    expect(overlay).toBeInTheDocument();
    expect(await screen.findByText(/Creating your Google Sheets destination/i)).toBeInTheDocument();

    resolveCreate({ id: 'destination-1' });

    await waitFor(() => {
      expect(screen.queryByTestId('saving-overlay')).not.toBeInTheDocument();
    });
  });

  it('ignores a second onConnected firing while a save is already in flight', async () => {
    let resolveCreate: (value: { id: string }) => void = () => undefined;
    vi.mocked(dataDestinationService.createConnectGoogleSheetsDestination).mockReturnValue(
      new Promise(resolve => {
        resolveCreate = resolve;
      }) as never
    );

    renderPage();

    const connectButton = await screen.findByText('Connect with Google (mock)');
    connectButton.click();
    connectButton.click();
    connectButton.click();

    await screen.findByTestId('saving-overlay');
    expect(dataDestinationService.createConnectGoogleSheetsDestination).toHaveBeenCalledTimes(1);

    resolveCreate({ id: 'destination-1' });
    await waitFor(() => {
      expect(screen.queryByTestId('saving-overlay')).not.toBeInTheDocument();
    });
    expect(dataDestinationService.createConnectGoogleSheetsDestination).toHaveBeenCalledTimes(1);
  });

  it('reconnects the kept Credential after a failed creation instead of creating another', async () => {
    vi.mocked(dataDestinationService.createConnectGoogleSheetsDestination).mockRejectedValueOnce(
      new Error('Duplicate title')
    );

    renderPage();

    const connectButton = await screen.findByText('Connect with Google (mock)');
    connectButton.click();

    expect(await screen.findByText('Duplicate title')).toBeInTheDocument();
    // The connect component reconnects the Credential it is given.
    expect(oauth.connectProps.at(-1)).toMatchObject({
      credential: { id: 'credential-1' },
      variant: 'quick-connect',
    });

    connectButton.click();

    await waitFor(() => {
      expect(dataDestinationService.createConnectGoogleSheetsDestination).toHaveBeenCalledTimes(2);
    });
    expect(dataDestinationService.createConnectGoogleSheetsDestination).toHaveBeenLastCalledWith({
      title: 'Google Sheets (user@example.com)',
      reusableCredentialId: 'credential-1',
    });
    expect(await screen.findByText(/was created successfully/i)).toBeInTheDocument();
    // A reconnect creates no Credential.
    expect(
      trackEvent.mock.calls.filter(([event]) => event.event === 'destination_credential_created')
    ).toHaveLength(1);
  });

  it('shows the server sentence of a failed creation, not the transport message', async () => {
    vi.mocked(dataDestinationService.createConnectGoogleSheetsDestination).mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 403'), {
        response: { status: 403, data: { message: 'You cannot use this Credential.' } },
      })
    );

    renderPage();

    (await screen.findByText('Connect with Google (mock)')).click();

    expect(await screen.findByText('You cannot use this Credential.')).toBeInTheDocument();
    expect(screen.queryByText('Request failed with status code 403')).not.toBeInTheDocument();
  });

  it('reports each Credential it creates as the Destination form does', async () => {
    renderPage();

    (await screen.findByText('Connect with Google (mock)')).click();

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith({
        event: 'destination_credential_created',
        category: 'DataDestination',
        action: 'google-sheets-oauth',
        label: 'GOOGLE_SHEETS',
        context: null,
        value: null,
      });
    });
  });

  it('retries a failed creation with the connected Credential, without asking Google again', async () => {
    vi.mocked(dataDestinationService.createConnectGoogleSheetsDestination).mockRejectedValueOnce(
      new Error('Duplicate title')
    );

    renderPage();

    (await screen.findByText('Connect with Google (mock)')).click();
    expect(await screen.findByText('Duplicate title')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(dataDestinationService.createConnectGoogleSheetsDestination).toHaveBeenCalledTimes(2);
    });
    expect(dataDestinationService.createConnectGoogleSheetsDestination).toHaveBeenLastCalledWith({
      title: 'Google Sheets (user@example.com)',
      reusableCredentialId: 'credential-1',
    });
    expect(await screen.findByText(/was created successfully/i)).toBeInTheDocument();
    // Retry creates no Credential.
    expect(
      trackEvent.mock.calls.filter(([event]) => event.event === 'destination_credential_created')
    ).toHaveLength(1);
  });
});
