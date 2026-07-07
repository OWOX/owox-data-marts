import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectGoogleSheetsPage } from './ConnectGoogleSheetsPage';
import { ConnectGoogleSheetsDonePage } from './ConnectGoogleSheetsDonePage';
import { destinationOAuthApi } from '../../features/google-oauth';
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

vi.mock('../../features/google-oauth', () => ({
  destinationOAuthApi: {
    getSettings: vi.fn(),
    getCredentialStatus: vi.fn(),
  },
  GoogleOAuthConnectButton: ({ onSuccess }: { onSuccess?: (credentialId: string) => void }) => (
    <button
      type='button'
      onClick={() => {
        onSuccess?.('credential-1');
      }}
    >
      Connect with Google (mock)
    </button>
  ),
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
    vi.mocked(destinationOAuthApi.getSettings).mockResolvedValue({ available: true });
    vi.mocked(destinationOAuthApi.getCredentialStatus).mockResolvedValue({
      isValid: true,
      credentialId: 'credential-1',
      user: { email: 'user@example.com' },
    });
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
        credentialId: 'credential-1',
      });
    });
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

  it('ignores a second onSuccess firing while a save is already in flight', async () => {
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

  it('shows an error and allows retrying by reconnecting when creation fails', async () => {
    vi.mocked(dataDestinationService.createConnectGoogleSheetsDestination).mockRejectedValueOnce(
      new Error('Duplicate title')
    );

    renderPage();

    const connectButton = await screen.findByText('Connect with Google (mock)');
    connectButton.click();

    expect(await screen.findByText('Duplicate title')).toBeInTheDocument();

    vi.mocked(dataDestinationService.createConnectGoogleSheetsDestination).mockResolvedValue({
      id: 'destination-1',
    } as never);
    connectButton.click();

    await waitFor(() => {
      expect(dataDestinationService.createConnectGoogleSheetsDestination).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText(/was created successfully/i)).toBeInTheDocument();
  });
});
