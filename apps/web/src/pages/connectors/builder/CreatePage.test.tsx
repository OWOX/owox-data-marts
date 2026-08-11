import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type { Role, User } from '../../../features/idp/types';
import ConnectorBuilderCreatePage from './CreatePage';

const authUser = vi.hoisted(() => ({ value: null as User | null }));
const create = vi.hoisted(() => vi.fn());
const getById = vi.hoisted(() => vi.fn());

vi.mock('../../../features/idp/hooks/useAuthState', () => ({
  useAuthState: () => ({ isLoading: false }),
  useUser: () => authUser.value,
  useIsAuthenticated: () => authUser.value !== null,
  useAuthActions: () => ({}),
}));

vi.mock('../../../features/connector-builder/shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    create = create;
    getById = getById;
    getVersion = vi.fn();
    saveDraft = vi.fn();
    publish = vi.fn();
    softDelete = vi.fn();
  },
}));

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@monaco-editor/react', () => ({
  Editor: ({ value }: { value: string }) => (
    <textarea data-testid='monaco' value={value} readOnly />
  ),
}));

function user(roles: Role[]): User {
  return { id: 'u-1', projectId: 'p-1', roles };
}

function renderRoute() {
  const router = createMemoryRouter(
    [
      { path: '/connectors/builder/new', element: <ConnectorBuilderCreatePage /> },
      { path: '/connectors/builder/:id', element: <div data-testid='edit-route' /> },
    ],
    { initialEntries: ['/connectors/builder/new'] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('ConnectorBuilderCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    authUser.value = user(['editor']);
    create.mockResolvedValue({ id: 'def-1', name: 'MyApi', title: 'My API' });
    getById.mockResolvedValue({
      id: 'def-1',
      name: 'MyApi',
      title: 'My API',
      description: null,
      logo: null,
      docUrl: null,
      activeVersionId: null,
      versions: [{ version: 1, status: 'draft', publishedAt: null }],
    });
  });

  it('swaps /new for /:id after the first save without asking about unsaved changes', async () => {
    const router = renderRoute();
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/connectors/builder/def-1');
    });
    // The save is what cleared the unsaved edits, so the URL swap it triggers is not a
    // departure the author should be asked about.
    expect(screen.queryByText('Unsaved Changes')).toBeNull();
  });

  it('does not open the builder for a viewer', () => {
    authUser.value = user(['viewer']);
    renderRoute();

    expect(screen.getByTestId('builder-not-authorised')).toBeInTheDocument();
    expect(screen.queryByTestId('builder-topbar')).toBeNull();
  });
});
