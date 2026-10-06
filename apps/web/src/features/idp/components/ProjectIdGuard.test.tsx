import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const renderAt = (path: string) =>
  render(
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

describe('ProjectIdGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    user = { projectId: '42' };
    authState = { isLoading: false };
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
});
