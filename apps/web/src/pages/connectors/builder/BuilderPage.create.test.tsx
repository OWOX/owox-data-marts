import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type { Role, User } from '../../../features/idp/types';
import { trackEvent } from '../../../utils/data-layer';
import ConnectorBuilderRoutePage from './BuilderPage';

vi.mock('../../../utils/data-layer', () => ({ trackEvent: vi.fn() }));

const authUser = vi.hoisted(() => ({ value: null as User | null }));
const create = vi.hoisted(() => vi.fn());
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
    create = create;
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

/** The builder route as the app declares it, opened on a connector that does not exist yet. */
function renderRoute(state?: unknown) {
  const router = createMemoryRouter(
    [{ path: '/connectors/builder/:id', element: <ConnectorBuilderRoutePage /> }],
    { initialEntries: [{ pathname: '/connectors/builder/new', state }] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

const openedEvents = () =>
  vi
    .mocked(trackEvent)
    .mock.calls.map(([payload]) => payload)
    .filter(payload => payload.event === 'custom_connector_builder_opened');

describe('ConnectorBuilderRoutePage — where the author came from', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authUser.value = user(['editor']);
  });

  it('reports the entry point the navigation carried', async () => {
    renderRoute({ builderEntryPoint: 'data_mart_wizard' });

    await waitFor(() => {
      expect(openedEvents()).toEqual([
        expect.objectContaining({ mode: 'new', entryPoint: 'data_mart_wizard' }),
      ]);
    });
  });

  it('reports a direct visit when the navigation carried none, or an unknown one', async () => {
    renderRoute({ builderEntryPoint: 'somewhere else' });

    await waitFor(() => {
      expect(openedEvents()).toEqual([expect.objectContaining({ entryPoint: 'direct' })]);
    });
  });
});

describe('ConnectorBuilderRoutePage — a new connector', () => {
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

  // The save commits the new id before it reads the connector back, and the id is what swaps
  // the route. A slower read left the save still marking the builder as unsaved at that point.
  it('asks nothing about unsaved changes when reading the new connector back is slow', async () => {
    let finishRead: (detail: unknown) => void = () => undefined;
    getById.mockReturnValue(
      new Promise(resolve => {
        finishRead = resolve;
      })
    );
    const router = renderRoute();
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/connectors/builder/def-1');
    });
    expect(screen.queryByText('Unsaved Changes')).toBeNull();
    finishRead({
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

  it('keeps the builder open, test panel and all, when the first save swaps the URL', async () => {
    getVersion.mockResolvedValue({
      version: 1,
      status: 'draft',
      manifest: { version: '1.0', name: 'MyApi', baseUrl: '', parameters: {}, nodes: {} },
    });
    const router = renderRoute();
    fireEvent.click(screen.getByTestId('open-dock'));
    expect(screen.getByTestId('test-panel')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/connectors/builder/def-1');
    });
    // Only a builder rendered for the new URL reads the version back, so this waits for the
    // swap to have rendered rather than just for the router to have moved.
    await waitFor(() => {
      expect(getVersion).toHaveBeenCalledWith('def-1', 1);
    });
    expect(screen.getByTestId('test-panel')).toBeInTheDocument();
  });

  it('does not open the builder for a viewer', () => {
    authUser.value = user(['viewer']);
    renderRoute();

    expect(screen.getByTestId('builder-not-authorised')).toBeInTheDocument();
    expect(screen.queryByTestId('builder-topbar')).toBeNull();
  });
});
