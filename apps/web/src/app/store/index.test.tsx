import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppBootstrap, AppStoreProvider } from './index';
import { AuthContext } from '../../features/idp/context/AuthContext.types';
import { AuthStatus } from '../../features/idp/types';
import { appFlagsService } from '../services/app-flags.service';
import { useFlags } from './hooks';

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

it('loads the public feature flags on the Request access screen', async () => {
  window.history.replaceState({}, '', '/ui/project-a/request-access');
  vi.spyOn(appFlagsService, 'getFlags').mockResolvedValue({
    IDP_PROVIDER: 'owox-better-auth',
    CLOUD_ACCOUNT_API_ORIGIN: 'https://ib.example.test',
  });

  function AccountMenuEntry() {
    const { flags } = useFlags();
    return flags?.CLOUD_ACCOUNT_API_ORIGIN ? <span>My account is available</span> : null;
  }

  render(
    <AuthContext.Provider
      value={{
        status: AuthStatus.AUTHENTICATED,
        user: { id: 'user-1', projectId: 'project-a', roles: [] },
        session: { accessToken: 'app-token' },
        signIn: vi.fn(),
        signOut: vi.fn(),
        refreshToken: vi.fn(),
        clearError: vi.fn(),
      }}
    >
      <AppStoreProvider>
        <AppBootstrap>
          <AccountMenuEntry />
        </AppBootstrap>
      </AppStoreProvider>
    </AuthContext.Provider>
  );

  expect(await screen.findByText('My account is available')).toBeVisible();
});

describe('AppBootstrap auth errors', () => {
  it('keeps the existing loader outside connect routes', () => {
    window.history.replaceState({}, '', '/ui/project-a/data-marts');
    render(
      <AuthContext.Provider
        value={{
          status: AuthStatus.ERROR,
          user: null,
          session: null,
          error: 'The session failed',
          signIn: vi.fn(),
          signOut: vi.fn(),
          refreshToken: vi.fn(),
          clearError: vi.fn(),
        }}
      >
        <AppStoreProvider>
          <AppBootstrap>
            <div>Protected content</div>
          </AppBootstrap>
        </AppStoreProvider>
      </AuthContext.Provider>
    );

    expect(screen.getByText('Loading application...')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });
});
