import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type { Role, User } from '../../../features/idp/types';
import ConnectorBuilderEditPage from './EditPage';

const authUser = vi.hoisted(() => ({ value: null as User | null }));
const getById = vi.hoisted(() => vi.fn());
const getVersion = vi.hoisted(() => vi.fn());

vi.mock('../../../features/idp/hooks/useAuthState', () => ({
  useAuthState: () => ({ isLoading: false }),
  useUser: () => authUser.value,
  useIsAuthenticated: () => authUser.value !== null,
  useAuthActions: () => ({}),
}));

vi.mock('../../../features/connector-builder/shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    create = vi.fn();
    getById = getById;
    getVersion = getVersion;
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

/** The builder route inside a data router, with somewhere else to navigate to. */
function renderRoute() {
  const router = createMemoryRouter(
    [
      { path: '/connectors/builder/:id', element: <ConnectorBuilderEditPage /> },
      { path: '/connectors', element: <div data-testid='connectors-list' /> },
    ],
    { initialEntries: ['/connectors/builder/def-1'] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('ConnectorBuilderEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    authUser.value = user(['editor']);
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
    getVersion.mockResolvedValue({
      version: 1,
      status: 'draft',
      manifest: {
        version: '1.0',
        name: 'MyApi',
        baseUrl: 'https://api.example.com',
        parameters: {},
        nodes: {},
      },
    });
  });

  describe('who may open the builder', () => {
    it('opens the builder for an editor', async () => {
      renderRoute();
      expect(screen.getByTestId('builder-topbar')).toBeInTheDocument();
      await waitFor(() => {
        expect(getVersion).toHaveBeenCalledWith('def-1', 1);
      });
    });

    it('tells a viewer the builder needs editor access instead of failing to load', () => {
      authUser.value = user(['viewer']);
      renderRoute();

      expect(screen.getByTestId('builder-not-authorised')).toBeInTheDocument();
      expect(screen.queryByTestId('builder-topbar')).toBeNull();
      // The manifest endpoint is editor-only; a viewer must not even ask for it.
      expect(getVersion).not.toHaveBeenCalled();
    });

    it('offers a viewer the way back to the connectors list', () => {
      authUser.value = user(['viewer']);
      const router = renderRoute();

      fireEvent.click(screen.getByRole('button', { name: /back to connectors/i }));
      expect(router.state.location.pathname).toBe('/connectors');
    });

    it('opens the builder for an admin', () => {
      authUser.value = user(['admin']);
      renderRoute();
      expect(screen.getByTestId('builder-topbar')).toBeInTheDocument();
    });
  });

  describe('leaving with unsaved changes', () => {
    async function makeDirty() {
      const router = renderRoute();
      await waitFor(() => {
        expect(getVersion).toHaveBeenCalled();
      });
      fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), {
        target: { value: 'Renamed' },
      });
      return router;
    }

    it('asks before navigating away from unsaved edits, and stays put on Cancel', async () => {
      const router = await makeDirty();

      await act(async () => {
        await router.navigate('/connectors');
      });

      expect(await screen.findByText('Unsaved Changes')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'No, stay here' }));

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/connectors/builder/def-1');
      });
      expect(screen.queryByTestId('connectors-list')).toBeNull();
    });

    it('leaves once the author confirms', async () => {
      const router = await makeDirty();

      await act(async () => {
        await router.navigate('/connectors');
      });
      fireEvent.click(await screen.findByRole('button', { name: 'Yes, leave now' }));

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/connectors');
      });
    });

    it('arms the browser prompt for a hard reload or tab close', async () => {
      await makeDirty();

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it('leaves a hard reload alone when everything is saved', async () => {
      renderRoute();
      await waitFor(() => {
        expect(getVersion).toHaveBeenCalled();
      });

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });

    it('does not stand in the way when there is nothing unsaved', async () => {
      const router = renderRoute();
      await waitFor(() => {
        expect(getVersion).toHaveBeenCalled();
      });

      await act(async () => {
        await router.navigate('/connectors');
      });

      expect(router.state.location.pathname).toBe('/connectors');
      expect(screen.queryByText('Unsaved Changes')).toBeNull();
    });
  });
});
