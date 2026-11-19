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

const mcp = vi.hoisted(() => ({ url: undefined as string | undefined }));
vi.mock('../../../features/idp/hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'authenticated',
    user: authUser.value && { ...authUser.value, mcpServerUrl: mcp.url },
  }),
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

describe('ConnectorBuilderRoutePage — AI assistant promo', () => {
  const PROMO_TITLE = 'Build it with your AI assistant';

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    authUser.value = user(['editor']);
    mcp.url = 'https://mcp.owox.com/mcp';
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
    getVersion.mockResolvedValue({
      version: 1,
      status: 'draft',
      manifest: { version: '1.0', name: 'MyApi', baseUrl: '', parameters: {}, nodes: {} },
    });
  });

  it('shows the card on a new connector', () => {
    renderRoute();

    expect(screen.getByText(PROMO_TITLE)).toBeInTheDocument();
  });

  it('shows nothing without an MCP server url', () => {
    mcp.url = undefined;
    renderRoute();

    expect(screen.queryByText(PROMO_TITLE)).toBeNull();
  });

  it('leaves nothing above the builder form without an MCP server url', () => {
    mcp.url = undefined;
    renderRoute();

    const pane = screen.getByTestId('builder-scroll-pane');
    const firstChild = pane.firstElementChild;
    expect(firstChild).toContainElement(screen.getByPlaceholderText('MyCustomApi'));
  });

  it('sends one shown event for the connector builder placement', () => {
    renderRoute();

    const shown = vi
      .mocked(trackEvent)
      .mock.calls.map(([payload]) => payload)
      .filter(payload => payload.event === 'mcp_promo_shown');
    expect(shown).toEqual([
      expect.objectContaining({ label: 'connector_builder', context: 'setup' }),
    ]);
  });

  it('hides the card in Code mode', () => {
    renderRoute();
    fireEvent.click(screen.getByTestId('mode-code'));

    expect(screen.queryByText(PROMO_TITLE)).toBeNull();
  });

  it('sends no second shown event after a switch to Code mode and back', () => {
    renderRoute();
    fireEvent.click(screen.getByTestId('mode-code'));
    fireEvent.click(screen.getByTestId('mode-builder'));

    expect(screen.getByText(PROMO_TITLE)).toBeInTheDocument();
    const shown = vi
      .mocked(trackEvent)
      .mock.calls.filter(([payload]) => payload.event === 'mcp_promo_shown');
    expect(shown).toHaveLength(1);
  });

  it('keeps the old prompt on a new connector', () => {
    renderRoute();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(PROMO_TITLE) }));

    const href = screen.getByRole('link', { name: /open in claude/i }).getAttribute('href') ?? '';
    expect(new URL(href).searchParams.get('q')).toContain('help me build a custom connector');
  });

  it('keeps the card, now naming the connector, once the first save gives it an id', async () => {
    const router = renderRoute();
    fireEvent.change(screen.getByPlaceholderText('MyCustomApi'), { target: { value: 'MyApi' } });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/connectors/builder/def-1');
    });
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(PROMO_TITLE) }));
    const href = screen.getByRole('link', { name: /open in claude/i }).getAttribute('href');
    expect(new URL(href ?? '').searchParams.get('q')).toContain(
      'finish the custom connector def-1'
    );
  });
});
