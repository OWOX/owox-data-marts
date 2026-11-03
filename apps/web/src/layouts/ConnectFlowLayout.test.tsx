import { useState, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, matchRoutes, useRoutes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import hotToast from 'react-hot-toast';
import { toast as sonnerToast } from 'sonner';
import { ConnectFlowLayout } from './ConnectFlowLayout';
import routes from '../routes';

const auth = vi.hoisted(() => ({
  user: { id: 'user-1', projectId: 'project-1' } as {
    id: string;
    projectId: string;
    projectTitle?: string;
  },
}));
vi.mock('../features/idp', async importOriginal => ({
  ...(await importOriginal<typeof import('../features/idp')>()),
  useAuth: () => auth,
}));
vi.mock('../pages/onboarding/InviteTeammatesPage', () => ({
  InviteTeammatesPage: () => <h1>Invite your colleague</h1>,
}));

vi.mock('./ProjectAuthGuards', () => ({
  ProjectAuthGuards: ({ children }: { children: ReactNode }) => (
    <div data-testid='project-auth-guards'>{children}</div>
  ),
}));

describe('ConnectFlowLayout', () => {
  beforeEach(() => {
    auth.user = { id: 'user-1', projectId: 'project-1', projectTitle: 'Marketing project' };
  });

  it.each([
    { projectId: 'project-1', projectTitle: 'Marketing project', expected: 'Marketing project' },
    { projectId: 'project-1', projectTitle: undefined, expected: 'project-1' },
    { projectId: 'project-2', projectTitle: 'Another project', expected: null },
  ])(
    'shows only the verified project name or its ID: $expected',
    ({ projectId, projectTitle, expected }) => {
      auth.user = { id: 'user-1', projectId, projectTitle };
      render(
        <MemoryRouter initialEntries={['/ui/project-1/connect/credentials/setup-1']}>
          <Routes>
            <Route path='/ui/:projectId/connect' element={<ConnectFlowLayout />}>
              <Route path='credentials/:setupId' element={<div>Credential form</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      );
      if (expected) {
        expect(screen.getByText('Project:')).toBeInTheDocument();
        expect(screen.getByText(expected)).toHaveAttribute('title', expected);
      } else {
        expect(screen.queryByText('Project:')).not.toBeInTheDocument();
        expect(screen.queryByText('Another project')).not.toBeInTheDocument();
      }
    }
  );

  afterEach(() => {
    cleanup();
    hotToast.remove();
    sonnerToast.dismiss();
  });

  it.each([
    ['OAuth', hotToast.error],
    ['shared controls', sonnerToast.error],
  ] as const)('renders errors from %s on the standalone setup page', async (_source, showError) => {
    const message = 'Invalid redirect URI. Must match the configured OAuth redirect URI.';
    render(
      <MemoryRouter initialEntries={['/ui/project-1/connect/credentials/setup-1']}>
        <Routes>
          <Route path='/ui/:projectId/connect' element={<ConnectFlowLayout />}>
            <Route
              path='credentials/:setupId'
              element={<button onClick={() => showError(message)}>Connect</button>}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('keeps the existing invitation route inside the shared guards', () => {
    function RouteTree() {
      return useRoutes(routes);
    }
    render(
      <MemoryRouter initialEntries={['/ui/project-1/onboarding/invite-teammates']}>
        <RouteTree />
      </MemoryRouter>
    );

    expect(screen.getByTestId('project-auth-guards')).toContainElement(
      screen.getByRole('heading', { name: 'Invite your colleague' })
    );
    expect(screen.queryByText('Invalid setup link')).not.toBeInTheDocument();
    expect(screen.queryByText('Project:')).not.toBeInTheDocument();
  });

  it.each(['?note=\\x', '#\\x'])('blocks a route when its complete URL is unsafe: %s', suffix => {
    const target = `/ui/project-1/connect/google-sheets${suffix}`;
    expect(matchRoutes([{ path: '/ui/:projectId/connect/google-sheets' }], target)).not.toBeNull();
    render(
      <MemoryRouter initialEntries={[target]}>
        <Routes>
          <Route path='/ui/:projectId/connect' element={<ConnectFlowLayout />}>
            <Route path='google-sheets' element={<button>Connect with Google</button>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Invalid setup link')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect with Google' })).not.toBeInTheDocument();
  });

  it('discards a mounted connect form when the account changes in the same project', () => {
    function Form() {
      const [originalUser] = useState(auth.user.id);
      return <div>{originalUser}</div>;
    }
    const view = () => (
      <MemoryRouter initialEntries={['/ui/project-1/connect/google-sheets']}>
        <Routes>
          <Route path='/ui/:projectId/connect' element={<ConnectFlowLayout />}>
            <Route path='google-sheets' element={<Form />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    const rendered = render(view());
    expect(screen.getByText('user-1')).toBeInTheDocument();
    auth.user = { id: 'user-2', projectId: 'project-1' };
    rendered.rerender(view());
    expect(screen.getByText('user-2')).toBeInTheDocument();
    expect(screen.queryByText('user-1')).not.toBeInTheDocument();
  });

  it('renders the routed page through the guard chain, with no sidebar chrome', () => {
    render(
      <MemoryRouter initialEntries={['/ui/project-1/connect/google-sheets']}>
        <Routes>
          <Route path='/ui/:projectId/connect' element={<ConnectFlowLayout />}>
            <Route path='google-sheets' element={<div>Connect Google Sheets page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    const guards = screen.getByTestId('project-auth-guards');
    expect(guards).toContainElement(screen.getByText('Connect Google Sheets page'));
    expect(screen.queryByTestId('full-app-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
