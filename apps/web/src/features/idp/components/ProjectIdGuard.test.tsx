import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signIn = vi.fn();
let user: { projectId: string } | null = { projectId: '42' };
let authState = { isLoading: false };
vi.mock('../hooks', () => ({
  useAuthState: () => authState,
  useUser: () => user,
}));
vi.mock('../services', () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

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
    user = { projectId: '42' };
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

  it('switches to the MCP resource project before rendering its request-access page', () => {
    renderAt('/ui/7/request-access?mcp-integration=claude');
    expect(signIn).toHaveBeenCalledWith({ projectId: '7' });
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

  it('removes a loaded connect form when the active project changes', () => {
    const target = '/ui/42/connect/credentials/setup-1?source=chat#form';
    const page = renderAt(target);
    expect(screen.getByText(`at ${target}`)).toBeInTheDocument();
    user = { projectId: '7' };

    page.rerender(viewAt(target));

    expect(screen.queryByText(/^at /)).not.toBeInTheDocument();
    expect(signIn).toHaveBeenCalledExactlyOnceWith({ projectId: '42', redirect: target });
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
