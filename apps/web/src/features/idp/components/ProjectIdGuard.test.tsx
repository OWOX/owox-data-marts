import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signIn = vi.fn();
const switchProject = vi.fn();
let flags: Record<string, unknown> = {};
vi.mock('../../../app/store/hooks', () => ({
  useFlags: () => ({ flags, callState: 'loaded' }),
}));
let user: { id?: string; projectId: string; viewOnly?: boolean } | null = { projectId: '42' };
let authState = { isLoading: false };
vi.mock('../hooks', () => ({
  useAuthState: () => authState,
  useUser: () => user,
}));
vi.mock('../services', () => ({
  signIn: (...args: unknown[]) => signIn(...args),
  switchProject: (...args: unknown[]) => switchProject(...args),
}));

import { ProjectIdGuard } from './ProjectIdGuard';

function Where() {
  const location = useLocation();
  return <p>at {`${location.pathname}${location.search}${location.hash}`}</p>;
}

const viewAt = (path: string) => (
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route
        path='/ui/:projectId/*'
        element={
          <ProjectIdGuard>
            <Where />
          </ProjectIdGuard>
        }
      />
    </Routes>
  </MemoryRouter>
);
const renderAt = (path: string) => render(viewAt(path));

describe('ProjectIdGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    user = { id: 'user-42', projectId: '42' };
    flags = {};
    switchProject.mockReset();
    authState = { isLoading: false };
    sessionStorage.clear();
  });
  afterEach(() => {
    sessionStorage.clear();
  });

  it('opens a placeholder link in the member project, keeping search and hash', () => {
    renderAt('/ui/none/plugins/p1?utm_source=owox.com#x');
    expect(screen.getByText('at /ui/42/plugins/p1?utm_source=owox.com#x')).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('still signs in to the project a real link names', () => {
    renderAt('/ui/7/plugins');
    expect(signIn).toHaveBeenCalledWith({ projectId: '7' });
  });

  it.each([false, true])(
    'switches the Cloud session with viewOnly=%s without sign-in',
    async viewOnly => {
      flags = { IDP_PROVIDER: 'owox-better-auth' };
      user = { id: 'user-42', projectId: '42', viewOnly };
      const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
      switchProject.mockResolvedValue(undefined);

      try {
        renderAt('/ui/7/plugins?source=pin#report');
        await waitFor(() => {
          expect(reload).toHaveBeenCalledOnce();
        });
        expect(switchProject).toHaveBeenCalledExactlyOnceWith('7', 'user-42');
        expect(signIn).not.toHaveBeenCalled();
      } finally {
        reload.mockRestore();
      }
    }
  );

  it('keeps the current session available when the project cannot be opened', async () => {
    flags = { IDP_PROVIDER: 'owox-better-auth' };
    switchProject.mockRejectedValue({ isAxiosError: true, response: { status: 403 } });

    renderAt('/ui/7/plugins');

    expect(await screen.findByRole('alert')).toHaveTextContent('This project is unavailable');
    expect(screen.getByRole('link', { name: 'Back to project' })).toHaveAttribute(
      'href',
      '/ui/42/data-marts'
    );
    expect(signIn).not.toHaveBeenCalled();
  });

  it.each(['better-auth', 'none'])('uses the original sign-in flow for %s', provider => {
    flags = { IDP_PROVIDER: provider };

    renderAt('/ui/7/plugins');

    expect(signIn).toHaveBeenCalledWith({ projectId: '7' });
    expect(switchProject).not.toHaveBeenCalled();
  });

  it('switches to the MCP resource project before rendering its request-access page', () => {
    renderAt('/ui/7/request-access?mcp-integration=claude');
    expect(signIn).toHaveBeenCalledWith({ projectId: '7' });
    expect(switchProject).not.toHaveBeenCalled();
    expect(screen.queryByText(/^at /)).not.toBeInTheDocument();
  });

  it('renders the page for the member own project', () => {
    renderAt('/ui/42/plugins');
    expect(screen.getByText('at /ui/42/plugins')).toBeInTheDocument();
  });

  it('shows the loader for a placeholder link while auth is still loading', () => {
    authState = { isLoading: true };
    renderAt('/ui/none/plugins/p1');
    expect(screen.queryByText(/^at /)).not.toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('does not crash or redirect a placeholder link when there is no user', () => {
    user = null;
    renderAt('/ui/none/plugins/p1');
    expect(screen.getByText('at /ui/none/plugins/p1')).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('uses the existing Connect sign-in flow when the Cloud project changes', () => {
    flags = { IDP_PROVIDER: 'owox-better-auth' };
    const target = '/ui/42/connect/credentials/setup-1?source=chat#form';
    const page = renderAt(target);
    expect(screen.getByText(`at ${target}`)).toBeInTheDocument();
    user = { id: 'user-42', projectId: '7' };

    page.rerender(viewAt(target));

    expect(screen.queryByText(/^at /)).not.toBeInTheDocument();
    expect(signIn).toHaveBeenCalledExactlyOnceWith({ projectId: '42', redirect: target });
    expect(switchProject).not.toHaveBeenCalled();
  });

  it('does not repeat a failed automatic switch for a connect URL', () => {
    const target = '/ui/7/connect/credentials/setup-1';
    sessionStorage.setItem('owox_connect_project_switch', target);
    const logout = vi.fn();
    window.addEventListener('auth:logout', logout);
    try {
      renderAt(target);

      expect(screen.queryByText(/^at /)).not.toBeInTheDocument();
      expect(signIn).not.toHaveBeenCalled();
      expect((logout.mock.calls[0][0] as CustomEvent).detail).toEqual({
        reason: 'connect_project_mismatch',
        connectTarget: target,
      });
    } finally {
      window.removeEventListener('auth:logout', logout);
    }
  });
});
