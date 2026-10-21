import { useContext } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthContext';
import { AuthContext } from './AuthContext.types';
import type { Role } from '../types';
import { RedirectStorageService } from '../services/redirect-storage.service';

const api = vi.hoisted(() => ({
  refreshAccessToken: vi.fn(),
  getUserApi: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../services', async () => {
  const { RedirectStorageService } = await import('../services/redirect-storage.service');
  return {
    ...api,
    RedirectStorageService,
    isBlockedUserError: () => false,
    isViewOnlySession: () => false,
  };
});

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
    sessionStorage.clear();
    api.refreshAccessToken.mockResolvedValue({ accessToken: 'access-token' });
    setRoles([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  function setRoles(roles: Role[], projectId = 'main-project') {
    api.getUserApi.mockResolvedValue({
      id: 'user-1',
      projectId,
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

  it.each(['claude', 'chatgpt'])(
    'restores the complete %s Request Access URL after switching to its project',
    async integration => {
      const target = `/ui/resource-project/request-access?mcp-integration=${integration}#access`;
      // signIn stores the target page before ProjectIdGuard changes the session's project.
      RedirectStorageService.save(target);
      setRoles([], 'resource-project');
      window.history.replaceState({}, '', '/');
      const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {});

      render(
        <AuthProvider>
          <Status />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(replace).toHaveBeenCalledWith(target);
      });
      expect(RedirectStorageService.retrieve()).toBeNull();
      expect(api.signIn).not.toHaveBeenCalled();
    }
  );

  it('keeps a stored protected page as redirect-to for an empty-role user', async () => {
    RedirectStorageService.save('/ui/main-project/data-marts?tab=recent#list');
    window.history.replaceState({}, '', '/');
    const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {});

    render(
      <AuthProvider>
        <Status />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        '/ui/main-project/request-access?redirect-to=%2Fui%2Fmain-project%2Fdata-marts%3Ftab%3Drecent%23list'
      );
    });
  });

  it.each([
    '/ui/other-project/request-access?mcp-integration=claude',
    'https://untrusted.example/ui/main-project/request-access?mcp-integration=claude',
    '//untrusted.example/ui/main-project/request-access?mcp-integration=claude',
  ])(
    'does not restore a stored Request Access URL outside the current project: %s',
    async target => {
      sessionStorage.setItem('owox_auth_redirect_url', target);
      window.history.replaceState({}, '', '/');
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
    }
  );

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
