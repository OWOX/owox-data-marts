import { StrictMode, useContext } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthContext';
import { AuthContext } from './AuthContext.types';
import { getTokenProvider } from '../../../app/api/token-provider';
import { RedirectStorageService } from '../services/redirect-storage.service';
import type { Role } from '../types';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ConnectFlowLayout } from '../../../layouts/ConnectFlowLayout';
import { AppBootstrap, AppStoreProvider } from '../../../app/store';

const api = vi.hoisted(() => ({
  refreshAccessToken: vi.fn(),
  getUserApi: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../services', async () => ({
  ...api,
  RedirectStorageService: (await import('../services/redirect-storage.service'))
    .RedirectStorageService,
  isBlockedUserError: () => false,
  isViewOnlySession: () => false,
}));
vi.mock('../../../utils', () => ({
  pushToDataLayer: vi.fn(),
  trackUserIdentified: vi.fn(),
  trackLogout: vi.fn(),
  suppressClientAnalytics: vi.fn(),
  setAnalyticsDisabled: vi.fn(),
}));
vi.mock('../../../app/services/app-flags.service', () => ({
  appFlagsService: { getFlags: vi.fn().mockResolvedValue({}) },
}));

const target = '/ui/project-a/connect/credentials/setup-1?source=chat#form';

function Status() {
  const auth = useContext(AuthContext);
  return (
    <>
      <span>
        {auth?.status}:{auth?.user?.projectId}
      </span>
      <button onClick={() => auth?.signIn()}>Retry sign-in</button>
    </>
  );
}

function setUser(projectId: string, roles: Role[] = ['editor']) {
  api.getUserApi.mockResolvedValue({ id: 'user-1', projectId, roles });
}

function renderAuth() {
  return render(
    <StrictMode>
      <AuthProvider>
        <Status />
      </AuthProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  window.history.replaceState({}, '', target);
  api.refreshAccessToken.mockResolvedValue({ accessToken: 'token-a' });
  api.signIn.mockImplementation((options?: { redirect?: string }) => {
    if (options?.redirect) RedirectStorageService.save(options.redirect);
  });
  setUser('project-a');
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('AuthProvider connect project', () => {
  it.each([{ roles: [] as Role[] }, { roles: ['editor'] as Role[] }])(
    'switches to the incoming project before publishing a different session with roles %j',
    async ({ roles }) => {
      setUser('project-b', roles);
      const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {});
      renderAuth();

      await waitFor(() => {
        expect(api.signIn).toHaveBeenCalledExactlyOnceWith({
          projectId: 'project-a',
          redirect: target,
        });
      });
      expect(replace).not.toHaveBeenCalled();
      expect(getTokenProvider()).toBeNull();
      expect(screen.queryByText('authenticated:project-b')).not.toBeInTheDocument();
      expect(RedirectStorageService.retrieve()).toBe(target);
    }
  );

  it('keeps an incoming connect URL instead of an older stored redirect', async () => {
    RedirectStorageService.save('/ui/project-a/data-marts');
    const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {});
    renderAuth();

    await screen.findByText('authenticated:project-a');
    expect(replace).not.toHaveBeenCalled();
    expect(RedirectStorageService.retrieve()).toBeNull();
  });

  it.each([{ roles: [] as Role[] }, { roles: ['editor'] as Role[] }])(
    'keeps the stored connect target after login returns another project with roles %j',
    async ({ roles }) => {
      RedirectStorageService.save(target);
      window.history.replaceState({}, '', '/');
      setUser('project-b', roles);
      const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {});
      renderAuth();

      await waitFor(() => {
        expect(api.signIn).toHaveBeenCalledExactlyOnceWith({
          projectId: 'project-a',
          redirect: target,
        });
      });
      expect(replace).not.toHaveBeenCalled();
      expect(RedirectStorageService.retrieve()).toBe(target);
    }
  );

  it('restores the complete connect URL after login selects its project', async () => {
    RedirectStorageService.save(target);
    window.history.replaceState({}, '', '/');
    const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {});
    renderAuth();

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(target);
    });
    expect(api.signIn).not.toHaveBeenCalled();
  });

  it('rejects a refreshed token from another project before returning or publishing it', async () => {
    renderAuth();
    await screen.findByText('authenticated:project-a');
    const provider = getTokenProvider();
    if (!provider) throw new Error('The authenticated token provider is missing');
    setUser('project-b');
    api.refreshAccessToken.mockResolvedValue({ accessToken: 'token-b' });

    await act(async () => {
      await expect(provider.refreshToken()).rejects.toThrow(
        'This setup requires project project-a'
      );
    });

    expect(screen.queryByText('authenticated:project-b')).not.toBeInTheDocument();
    expect(getTokenProvider()).toBeNull();
  });

  it('blocks the setup when a refreshed session belongs to another account', async () => {
    render(
      <AuthProvider>
        <AppStoreProvider>
          <AppBootstrap>
            <MemoryRouter initialEntries={[target]}>
              <Routes>
                <Route path='/ui/:projectId/connect' element={<ConnectFlowLayout />}>
                  <Route path='credentials/:setupId' element={<button>Save Credential</button>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AppBootstrap>
        </AppStoreProvider>
      </AuthProvider>
    );
    await screen.findByRole('button', { name: 'Save Credential' });
    const provider = getTokenProvider();
    if (!provider) throw new Error('The authenticated token provider is missing');
    api.getUserApi.mockResolvedValue({ id: 'user-2', projectId: 'project-a', roles: ['editor'] });
    api.refreshAccessToken.mockResolvedValue({ accessToken: 'token-b' });

    await act(async () => {
      await expect(provider.refreshToken()).rejects.toThrow('The signed-in account changed');
    });

    const switchAccount = await screen.findByRole('button', {
      name: 'Sign out and switch account',
    });
    expect(screen.queryByRole('button', { name: 'Save Credential' })).not.toBeInTheDocument();
    expect(getTokenProvider()).toBeNull();
    expect(api.signIn).not.toHaveBeenCalled();
    expect(RedirectStorageService.retrieve()).toBe(target);
    fireEvent.click(switchAccount);
    expect(api.signOut).toHaveBeenCalledTimes(1);
  });

  it('blocks a connect route with an encoded slash in the project ID', async () => {
    const invalidTarget = '/ui/project%2Fa/connect/credentials/setup-1';
    window.history.replaceState({}, '', invalidTarget);
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={[invalidTarget]}>
          <Routes>
            <Route path='/ui/:projectId/connect' element={<ConnectFlowLayout />}>
              <Route path='credentials/:setupId' element={<button>Save Credential</button>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    expect(await screen.findByText('Invalid setup link')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Credential' })).not.toBeInTheDocument();
  });

  it('keeps AuthGuard from starting a second sign-in after a connect refresh fails', async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={[target]}>
          <Routes>
            <Route path='/ui/:projectId/connect' element={<ConnectFlowLayout />}>
              <Route path='credentials/:setupId' element={<button>Save Credential</button>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    await screen.findByRole('button', { name: 'Save Credential' });
    const provider = getTokenProvider();
    if (!provider) throw new Error('The authenticated token provider is missing');
    api.refreshAccessToken.mockRejectedValue(new Error('The session expired'));

    await act(async () => {
      await expect(provider.refreshToken()).rejects.toThrow();
      window.dispatchEvent(
        new CustomEvent('auth:logout', {
          detail: { reason: 'token_refresh_failed', connectTarget: target },
        })
      );
    });

    expect(api.signIn).toHaveBeenCalledExactlyOnceWith({
      projectId: 'project-a',
      redirect: target,
    });
  });

  it('stops automatic sign-in after one failed switch and allows an explicit retry', async () => {
    setUser('project-b');
    const first = renderAuth();
    await waitFor(() => {
      expect(api.signIn).toHaveBeenCalledTimes(1);
    });
    first.unmount();
    api.signIn.mockClear();
    window.history.replaceState({}, '', '/');
    const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {});
    const landing = renderAuth();

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(target);
    });
    expect(api.signIn).not.toHaveBeenCalled();
    landing.unmount();
    window.history.replaceState({}, '', target);
    renderAuth();

    await screen.findByText('error:');
    expect(api.signIn).not.toHaveBeenCalled();
    expect(RedirectStorageService.retrieve()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry sign-in' }));
    expect(api.signIn).toHaveBeenCalledExactlyOnceWith({
      projectId: 'project-a',
      redirect: target,
    });
  });

  it('allows the app root to open after a failed switch blocks the setup', async () => {
    setUser('project-b');
    sessionStorage.setItem('owox_connect_project_switch', target);
    RedirectStorageService.save(target);
    const blocked = renderAuth();
    await screen.findByText('error:');
    blocked.unmount();

    window.history.replaceState({}, '', '/');
    const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {});
    renderAuth();

    await screen.findByText('authenticated:project-b');
    expect(api.signIn).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each(['manual retry', 'session refresh failure'])(
    'keeps the setup URL when another project mismatch arrives after %s starts sign-in',
    async source => {
      setUser('project-b');
      sessionStorage.setItem('owox_connect_project_switch', target);
      renderAuth();
      await screen.findByText('error:');

      if (source === 'manual retry') {
        fireEvent.click(screen.getByRole('button', { name: 'Retry sign-in' }));
      } else {
        act(() => {
          window.dispatchEvent(
            new CustomEvent('auth:logout', {
              detail: { reason: 'token_refresh_failed', connectTarget: target },
            })
          );
        });
      }
      expect(RedirectStorageService.retrieve()).toBe(target);

      act(() => {
        window.dispatchEvent(
          new CustomEvent('auth:logout', {
            detail: { reason: 'connect_project_mismatch', connectTarget: target },
          })
        );
      });

      expect(RedirectStorageService.retrieve()).toBe(target);
      expect(api.signIn).toHaveBeenCalledExactlyOnceWith({
        projectId: 'project-a',
        redirect: target,
      });
      expect(getTokenProvider()).toBeNull();
      expect(screen.queryByText('authenticated:project-b')).not.toBeInTheDocument();
    }
  );

  it('shows an explicit switch action when the provider still returns another project', async () => {
    setUser('project-b');
    sessionStorage.setItem('owox_connect_project_switch', target);
    render(
      <AuthProvider>
        <AppStoreProvider>
          <AppBootstrap>
            <MemoryRouter initialEntries={[target]}>
              <Routes>
                <Route path='/ui/:projectId/connect' element={<ConnectFlowLayout />}>
                  <Route path='credentials/:setupId' element={<button>Save Credential</button>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AppBootstrap>
        </AppStoreProvider>
      </AuthProvider>
    );

    const retry = await screen.findByRole('button', { name: 'Switch to setup project' });
    expect(screen.queryByRole('button', { name: 'Save Credential' })).not.toBeInTheDocument();
    expect(api.signIn).not.toHaveBeenCalled();
    fireEvent.click(retry);
    expect(api.signIn).toHaveBeenCalledExactlyOnceWith({
      projectId: 'project-a',
      redirect: target,
    });
  });

  it('uses the original connect target when a refresh fails after navigation', async () => {
    renderAuth();
    await screen.findByText('authenticated:project-a');
    window.history.replaceState({}, '', '/ui/project-b/data-marts');

    act(() => {
      window.dispatchEvent(
        new CustomEvent('auth:logout', {
          detail: { reason: 'token_refresh_failed', connectTarget: target },
        })
      );
    });

    expect(api.signIn).toHaveBeenCalledExactlyOnceWith({
      projectId: 'project-a',
      redirect: target,
    });
  });
});
