import { useContext } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthContext';
import { AuthContext } from './AuthContext.types';
import type { Role } from '../types';

const api = vi.hoisted(() => ({
  refreshAccessToken: vi.fn(),
  getUserApi: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../services', () => ({
  ...api,
  RedirectStorageService: { retrieve: () => null, clear: vi.fn() },
  isBlockedUserError: () => false,
  isViewOnlySession: () => false,
}));

vi.mock('../../../app/api/token-provider', () => ({
  setTokenProvider: vi.fn(),
  clearTokenProvider: vi.fn(),
  DefaultTokenProvider: class {
    getAccessToken() {
      return 'access-token';
    }
  },
}));

vi.mock('../../../utils', () => ({
  pushToDataLayer: vi.fn(),
  trackUserIdentified: vi.fn(),
  trackLogout: vi.fn(),
  suppressClientAnalytics: vi.fn(),
  setAnalyticsDisabled: vi.fn(),
}));

function Status() {
  const context = useContext(AuthContext);
  return <span>{context?.status}</span>;
}

describe('AuthProvider request-access entry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.refreshAccessToken.mockResolvedValue({ accessToken: 'access-token' });
    setRoles([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  function setRoles(roles: Role[]) {
    api.getUserApi.mockResolvedValue({
      id: 'user-1',
      projectId: 'main-project',
      roles,
      email: 'user@example.com',
    });
  }

  it.each(['claude', 'chatgpt'])(
    'keeps a %s MCP target project so ProjectIdGuard can switch from a restricted session',
    async integration => {
      const path = `/ui/resource-project/request-access?mcp-integration=${integration}`;
      window.history.replaceState({}, '', path);
      const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {});

      render(
        <AuthProvider>
          <Status />
        </AuthProvider>
      );
      await screen.findByText('authenticated');

      expect(replace).not.toHaveBeenCalled();
      expect(window.location.pathname + window.location.search).toBe(path);
      expect(api.signIn).not.toHaveBeenCalled();
    }
  );

  it('keeps ordinary empty-role entry routed to request access', async () => {
    window.history.replaceState({}, '', '/ui/main-project/data-marts');
    const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {});
    render(
      <AuthProvider>
        <Status />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        '/ui/main-project/request-access?redirect-to=%2Fui%2Fmain-project%2Fdata-marts'
      );
    });
  });

  it('does not resume an old OAuth authorization when access is approved', async () => {
    setRoles(['viewer']);
    window.history.replaceState(
      {},
      '',
      '/ui/main-project/request-access?mcp-integration=claude&redirect-to=%2Foauth%2Fauthorize'
    );
    const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {});
    render(
      <AuthProvider>
        <Status />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/ui/main-project/data-marts');
    });
    expect(api.signIn).not.toHaveBeenCalled();
  });
});
