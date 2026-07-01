import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleOAuthCallbackPage } from './GoogleOAuthCallbackPage';
import { destinationOAuthApi } from '../api/google-oauth-api.service';

vi.mock('../api/google-oauth-api.service', () => ({
  storageOAuthApi: { exchangeOAuthCode: vi.fn() },
  destinationOAuthApi: {
    exchangeOAuthCode: vi.fn(),
    finishMcpGoogleSheetsSetup: vi.fn(),
  },
}));

function renderCallbackPage(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/oauth/google/callback${search}`]}>
      <Routes>
        <Route path='/oauth/google/callback' element={<GoogleOAuthCallbackPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('GoogleOAuthCallbackPage — MCP setup fallback (no in-app popup session)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(destinationOAuthApi.finishMcpGoogleSheetsSetup).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects the browser when the finish endpoint returns a redirectTo', async () => {
    vi.mocked(destinationOAuthApi.finishMcpGoogleSheetsSetup).mockResolvedValue({
      destinationId: 'destination-1',
      redirectTo: 'https://claude.ai/chat/123',
    });
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      value: {},
      writable: true,
    });
    Object.defineProperty(window.location, 'href', {
      set: hrefSetter,
      configurable: true,
    });

    renderCallbackPage('?code=auth-code&state=signed-state');

    await waitFor(() => {
      expect(destinationOAuthApi.finishMcpGoogleSheetsSetup).toHaveBeenCalledWith(
        'auth-code',
        'signed-state'
      );
    });
    await waitFor(() => {
      expect(hrefSetter).toHaveBeenCalledWith('https://claude.ai/chat/123');
    });
  });

  it('shows a fallback message when there is no redirectTo', async () => {
    vi.mocked(destinationOAuthApi.finishMcpGoogleSheetsSetup).mockResolvedValue({
      destinationId: 'destination-1',
    });

    renderCallbackPage('?code=auth-code&state=signed-state');

    await waitFor(() => {
      expect(screen.getByText(/Google Sheets destination has been created/i)).toBeInTheDocument();
    });
  });

  it('shows an error message when the finish endpoint fails', async () => {
    vi.mocked(destinationOAuthApi.finishMcpGoogleSheetsSetup).mockRejectedValue(
      new Error('Invalid or expired OAuth state token')
    );

    renderCallbackPage('?code=auth-code&state=signed-state');

    await waitFor(() => {
      expect(screen.getByText(/Authentication failed/i)).toBeInTheDocument();
      expect(screen.getByText(/Invalid or expired OAuth state token/i)).toBeInTheDocument();
    });
  });

  it('does not call the MCP finish endpoint when sessionStorage has a mismatched in-app state (real CSRF path)', async () => {
    sessionStorage.setItem('oauth_state', 'a-different-state');
    sessionStorage.setItem('oauth_resource_type', 'destination');

    renderCallbackPage('?code=auth-code&state=signed-state');

    await waitFor(() => {
      expect(screen.getByText(/Invalid state token/i)).toBeInTheDocument();
    });
    expect(destinationOAuthApi.finishMcpGoogleSheetsSetup).not.toHaveBeenCalled();
  });
});
