import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryView, PluginGalleryEntry } from '../../../features/plugins';

let plugins: PluginGalleryEntry[] = [];
const update = vi.fn();
let view: GalleryView = { sort: 'default', filter: 'all' };

vi.mock('../../../features/plugins', async () => {
  const actual = await vi.importActual<typeof import('../../../features/plugins')>(
    '../../../features/plugins'
  );
  return {
    ...actual,
    usePluginGallery: () => ({ plugins, isLoading: false }),
    usePluginActions: () => ({ install: vi.fn(), isInstalling: false }),
    useGalleryView: () => ({ view, update }),
    PublishPluginSheet: () => null,
    InstallPluginDialog: () => null,
    // Stubbed to its name: the card has its own suite, and pulling the real one in would
    // drag the whole auth-dependent hook graph into a test about filtering and ordering.
    PluginCard: ({ plugin }: { plugin: PluginGalleryEntry }) => <div>{plugin.displayName}</div>,
  };
});
vi.mock('../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
  useProjectId: () => 'project-1',
}));

import PluginsGalleryPage from './PluginsGalleryPage';

const entry = (over: Partial<PluginGalleryEntry> = {}): PluginGalleryEntry => ({
  pluginId: 'p1',
  displayName: 'Alpha Plugin',
  description: 'Does something',
  currentSemver: '1.0.0',
  currentVersionId: 'v1',
  visibleViaScopes: ['member'],
  suspended: false,
  installationState: 'not_installed',
  source: { ownerName: 'owox', ownerUrl: 'https://github.com/owox' },
  addedAt: '2026-07-01T00:00:00.000Z',
  ...over,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <PluginsGalleryPage />
    </MemoryRouter>
  );

describe('PluginsGalleryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    view = { sort: 'default', filter: 'all' };
    plugins = [entry()];
  });

  it('offers publishing as the only action in the header', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Publish Plugin' })).toBeTruthy();
    // History is a recovery path, so it must not compete with publishing.
    expect(screen.queryByRole('link', { name: 'Installation history' })).toBeNull();
  });

  it('reaches installation history through the overflow menu', () => {
    renderPage();

    fireEvent.keyDown(screen.getByRole('button', { name: 'More plugin actions' }), {
      key: 'Enter',
    });

    expect(screen.getByRole('menuitem', { name: 'Installation history' })).toHaveAttribute(
      'href',
      '/ui/project-1/plugins/history'
    );
  });

  it('filters to what the member has installed', () => {
    view = { sort: 'default', filter: 'installed' };
    plugins = [
      entry(),
      entry({ pluginId: 'p2', displayName: 'Beta Plugin', installationState: 'installed' }),
    ];
    renderPage();

    expect(screen.getByText('Beta Plugin')).toBeTruthy();
    expect(screen.queryByText('Alpha Plugin')).toBeNull();
  });

  it('filters by gallery audience (project-available includes verified; only for me is personal)', () => {
    plugins = [
      entry({ pluginId: 'v', displayName: 'Verified One', visibleViaScopes: ['deployment'] }),
      entry({ pluginId: 'p', displayName: 'Project One', visibleViaScopes: ['project'] }),
      entry({ pluginId: 'm', displayName: 'Mine Only', visibleViaScopes: ['member'] }),
    ];

    view = { sort: 'default', filter: 'project' };
    renderPage();
    expect(screen.getByText('Verified One')).toBeTruthy();
    expect(screen.getByText('Project One')).toBeTruthy();
    expect(screen.queryByText('Mine Only')).toBeNull();
    cleanup();

    view = { sort: 'default', filter: 'for_me' };
    renderPage();
    expect(screen.getByText('Mine Only')).toBeTruthy();
    expect(screen.queryByText('Project One')).toBeNull();
    expect(screen.queryByText('Verified One')).toBeNull();
  });

  /**
   * A backend older than this build does not send addedAt at all, and the browser can be
   * the newer half of a rolling deploy. Ordering degrades to whatever the server sent.
   */
  it('survives a backend that sends no dates', () => {
    view = { sort: 'newest', filter: 'all' };
    plugins = [
      { ...entry({ pluginId: 'a', displayName: 'First' }), addedAt: undefined },
      { ...entry({ pluginId: 'b', displayName: 'Second' }), addedAt: undefined },
    ];
    renderPage();

    expect(screen.getAllByText(/First|Second/).map(node => node.textContent)).toEqual([
      'First',
      'Second',
    ]);
  });

  it('orders by newest without mutating the cached list', () => {
    view = { sort: 'newest', filter: 'all' };
    const cached = [
      entry({ pluginId: 'old', displayName: 'Older', addedAt: '2026-01-01T00:00:00.000Z' }),
      entry({ pluginId: 'new', displayName: 'Newer', addedAt: '2026-07-01T00:00:00.000Z' }),
    ];
    plugins = cached;
    renderPage();

    const names = screen.getAllByText(/Older|Newer/).map(node => node.textContent);
    expect(names).toEqual(['Newer', 'Older']);
    // The query cache hands back the same array on every render; sorting it in place
    // would quietly reorder it for every other consumer.
    expect(cached[0].displayName).toBe('Older');
  });

  // Distinct from having no plugins at all: publishing is not the fix here.
  it('separates "nothing matches" from "nothing published"', async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Search plugins'), {
      target: { value: 'nothing-like-this' },
    });

    // SearchInput debounces by 500ms, so the query only reaches the page after it fires.
    expect(await screen.findByText('No plugins match this search or filter.')).toBeTruthy();
    expect(screen.queryByText('Add your first plugin')).toBeNull();
  });

  it('invites the first plugin when the Gallery is empty', () => {
    plugins = [];
    renderPage();

    expect(screen.getByText('Add your first plugin')).toBeTruthy();
  });
});
