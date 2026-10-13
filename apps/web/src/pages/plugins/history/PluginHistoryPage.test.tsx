import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstalledPlugin, PluginHistoryEvent } from '../../../features/plugins';

let installations: InstalledPlugin[] = [];
let events: PluginHistoryEvent[] = [];
let hasMore = false;
const loadMore = vi.fn();
const install = vi.fn();
const usePluginHistory = vi.fn();

vi.mock('../../../features/plugins', async () => ({
  usePluginHistory: (type: string) => {
    usePluginHistory(type);
    return { events, isLoading: false, hasMore, isLoadingMore: false, loadMore };
  },
  usePluginInstallations: () => ({ installations, isLoading: false }),
  usePluginActions: () => ({ install, isInstalling: false }),
  InstallPluginDialog: (
    await vi.importActual<
      typeof import('../../../features/plugins/components/InstallPluginDialog')
    >('../../../features/plugins/components/InstallPluginDialog')
  ).InstallPluginDialog,
}));
vi.mock('../../../features/credentials', () => ({
  CredentialConfigSheet: () => null,
  useCredentials: () => ({ credentials: [], isLoading: false }),
  useCredentialDefinitions: () => ({ definitions: [], isLoading: false }),
  normalizePluginCredentialRequirement: vi.fn(),
  isCredentialEligible: () => false,
}));
vi.mock('../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
}));

import PluginHistoryPage from './PluginHistoryPage';

const installation = (over: Partial<InstalledPlugin> = {}): InstalledPlugin => ({
  pluginId: 'p1',
  displayName: 'Dashboards',
  description: 'Does something',
  currentSemver: '1.0.0',
  currentVersionId: 'v1',
  visibleViaScopes: [],
  suspended: false,
  installationState: 'uninstalled',
  source: { ownerName: 'acme', ownerUrl: 'https://github.com/acme' },
  addedAt: '2026-07-01T00:00:00.000Z',
  installationId: 'i1',
  installedAt: '2026-07-01T00:00:00.000Z',
  uninstalledAt: '2026-07-10T00:00:00.000Z',
  ...over,
});

let counter = 0;
const event = (over: Partial<PluginHistoryEvent>): PluginHistoryEvent => ({
  id: `e${++counter}`,
  occurredAt: '2026-10-01T10:00:00.000Z',
  action: 'install',
  scope: null,
  plugin: { pluginId: 'p1', displayName: 'Dashboards', ownerName: 'acme' },
  actor: { kind: 'you' },
  version: null,
  ...over,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <PluginHistoryPage />
    </MemoryRouter>
  );

describe('PluginHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    install.mockResolvedValue(null);
    installations = [];
    events = [];
    hasMore = false;
  });

  it('explains publishing versus installing', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Plugin history' })).toBeTruthy();
    expect(screen.getByText(/only you see your installations/)).toBeTruthy();
  });

  it.each([
    [event({ action: 'install' }), 'You installed Dashboards'],
    [event({ action: 'restore' }), 'You restored Dashboards'],
    [event({ action: 'uninstall' }), 'You removed Dashboards'],
    [
      event({
        action: 'publish',
        scope: 'project',
        actor: { kind: 'member', name: 'Max Voloshyn' },
      }),
      'Max Voloshyn published Dashboards for the project',
    ],
    [
      event({ action: 'unpublish', scope: 'project', actor: { kind: 'you' } }),
      'You unpublished Dashboards for the project',
    ],
    [
      event({ action: 'publish', scope: 'member', actor: { kind: 'you' } }),
      'You published Dashboards for yourself',
    ],
    [
      event({ action: 'unpublish', scope: 'deployment', actor: { kind: 'deployment' } }),
      'Dashboards: Verified listing changed',
    ],
    [
      event({
        action: 'update',
        actor: { kind: 'member', name: 'Max Voloshyn' },
        version: '1.2.0',
      }),
      'Dashboards updated to v1.2.0 by Max Voloshyn',
    ],
    [event({ action: 'update', actor: null, version: '1.2.0' }), 'Dashboards updated to v1.2.0'],
    [
      event({ action: 'suspend', actor: { kind: 'deployment' } }),
      'Dashboards was suspended by the deployment administrator',
    ],
    [
      event({ action: 'resume', actor: { kind: 'deployment' } }),
      'Dashboards was resumed by the deployment administrator',
    ],
  ])('describes %#', (item, sentence) => {
    events = [item];
    renderPage();

    expect(screen.getByRole('listitem').textContent).toContain(sentence);
  });

  it('describes a publication whose publisher is unknown without a name', () => {
    events = [event({ action: 'publish', scope: 'project', actor: null })];
    renderPage();

    expect(screen.getByRole('listitem').textContent).toContain(
      'Dashboards was published for the project'
    );
  });

  it('badges a Verified listing change', () => {
    events = [event({ action: 'publish', scope: 'deployment', actor: { kind: 'deployment' } })];
    renderPage();

    expect(screen.getByText('Verified')).toBeTruthy();
  });

  it('links the plugin name to its page', () => {
    events = [event({})];
    renderPage();

    expect(screen.getByRole('link', { name: 'Dashboards' })).toHaveAttribute(
      'href',
      '/ui/project-1/plugins/p1'
    );
  });

  it('switches the filter', () => {
    renderPage();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Publications' }));

    expect(usePluginHistory).toHaveBeenLastCalledWith('publications');
  });

  it('offers Restore only on the latest removal of a plugin that is still removed', () => {
    installations = [installation({})];
    events = [
      event({ action: 'uninstall', occurredAt: '2026-10-03T10:00:00.000Z' }),
      event({ action: 'restore', occurredAt: '2026-10-02T10:00:00.000Z' }),
      event({ action: 'uninstall', occurredAt: '2026-10-01T10:00:00.000Z' }),
    ];
    renderPage();

    const restores = screen.getAllByRole('button', { name: 'Restore' });
    expect(restores).toHaveLength(1);
    expect(screen.getAllByRole('listitem')[0]).toContainElement(restores[0]);
  });

  it('offers no Restore for a plugin that is installed again', () => {
    installations = [installation({ installationState: 'installed', uninstalledAt: null })];
    events = [event({ action: 'uninstall' })];
    renderPage();

    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
  });

  it('blocks restoring a suspended plugin', () => {
    installations = [installation({ suspended: true })];
    events = [event({ action: 'uninstall' })];
    renderPage();

    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled();
  });

  it('asks before restoring', async () => {
    installations = [installation({})];
    events = [event({ action: 'uninstall' })];
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(await screen.findByText('Install this plugin?')).toBeTruthy();
    expect(install).not.toHaveBeenCalled();
  });

  it('loads more on request', () => {
    events = [event({})];
    hasMore = true;
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    expect(loadMore).toHaveBeenCalled();
  });

  it('shows an empty state per filter', () => {
    renderPage();

    expect(screen.getByText('No plugin history yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse plugins' })).toHaveAttribute(
      'href',
      '/ui/project-1/plugins'
    );
  });

  it('shows Show more, not the empty state, when a page holds only deleted plugins', () => {
    hasMore = true;
    renderPage();

    expect(screen.queryByText('No plugin history yet')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show more' })).toBeTruthy();
  });
});
