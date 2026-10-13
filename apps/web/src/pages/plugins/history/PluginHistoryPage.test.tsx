import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstalledPlugin, PluginHistoryEvent } from '../../../features/plugins';

let installations: InstalledPlugin[] = [];
let events: PluginHistoryEvent[] = [];
let hasMore = false;
let isError = false;
let installationsError = false;
const retry = vi.fn();
const loadMore = vi.fn();
const install = vi.fn();
const usePluginHistory = vi.fn();

vi.mock('../../../features/plugins', async () => ({
  usePluginHistory: (type: string) => {
    usePluginHistory(type);
    return { events, isLoading: false, isError, hasMore, isLoadingMore: false, loadMore, retry };
  },
  usePluginInstallations: () => ({
    installations,
    isLoading: false,
    isError: installationsError,
  }),
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
    isError = false;
    installationsError = false;
  });

  it('explains publishing versus installing', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Plugin history' })).toBeTruthy();
    expect(screen.getByText(/only you see your installations/)).toBeTruthy();
  });

  it.each([
    ['install', event({ action: 'install' }), 'You installed Dashboards'],
    ['restore', event({ action: 'restore' }), 'You restored Dashboards'],
    ['uninstall', event({ action: 'uninstall' }), 'You removed Dashboards'],
    [
      'project publish by a member',
      event({
        action: 'publish',
        scope: 'project',
        actor: { kind: 'member', name: 'Max Voloshyn' },
      }),
      'Max Voloshyn published Dashboards for the project',
    ],
    [
      'project unpublish by you',
      event({ action: 'unpublish', scope: 'project', actor: { kind: 'you' } }),
      'You unpublished Dashboards for the project',
    ],
    [
      'member publish',
      event({ action: 'publish', scope: 'member', actor: { kind: 'you' } }),
      'You published Dashboards for yourself',
    ],
    [
      'deployment unpublish',
      event({ action: 'unpublish', scope: 'deployment', actor: { kind: 'deployment' } }),
      'Dashboards: Verified listing changed',
    ],
    [
      'update by a member',
      event({
        action: 'update',
        actor: { kind: 'member', name: 'Max Voloshyn' },
        version: '1.2.0',
      }),
      'Dashboards updated to v1.2.0 by Max Voloshyn',
    ],
    [
      'update by you',
      event({ action: 'update', actor: { kind: 'you' }, version: '1.2.0' }),
      'Dashboards updated to v1.2.0 by you',
    ],
    [
      'update by an unknown actor',
      event({ action: 'update', actor: null, version: '1.2.0' }),
      'Dashboards updated to v1.2.0',
    ],
    [
      'suspend',
      event({ action: 'suspend', actor: { kind: 'deployment' } }),
      'Dashboards was suspended by the deployment administrator',
    ],
    [
      'resume',
      event({ action: 'resume', actor: { kind: 'deployment' } }),
      'Dashboards was resumed by the deployment administrator',
    ],
  ])('describes $0', (_label, item, sentence) => {
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

    const restores = screen.getAllByRole('button', { name: 'Restore Dashboards' });
    expect(restores).toHaveLength(1);
    expect(screen.getAllByRole('listitem')[0]).toContainElement(restores[0]);
  });

  it('offers no Restore for a plugin that is installed again', () => {
    installations = [installation({ installationState: 'installed', uninstalledAt: null })];
    events = [event({ action: 'uninstall' })];
    renderPage();

    expect(screen.queryByRole('button', { name: 'Restore Dashboards' })).toBeNull();
  });

  it('blocks restoring a suspended plugin', () => {
    installations = [installation({ suspended: true })];
    events = [event({ action: 'uninstall' })];
    renderPage();

    expect(screen.getByRole('button', { name: 'Restore Dashboards' })).toBeDisabled();
  });

  it('badges a suspended plugin as unavailable next to its disabled Restore', () => {
    installations = [installation({ suspended: true })];
    events = [event({ action: 'uninstall' })];
    renderPage();

    const restore = screen.getByRole('button', { name: 'Restore Dashboards' });
    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(restore).toBeDisabled();
  });

  it('disables Restore for a removed plugin with no current version', () => {
    installations = [installation({ currentVersionId: null })];
    events = [event({ action: 'uninstall' })];
    renderPage();

    expect(screen.getByRole('button', { name: 'Restore Dashboards' })).toBeDisabled();
  });

  it('asks before restoring', async () => {
    installations = [installation({})];
    events = [event({ action: 'uninstall' })];
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Restore Dashboards' }));

    expect(await screen.findByText('Install this plugin?')).toBeTruthy();
    expect(install).not.toHaveBeenCalled();
  });

  it('lists a removal that is not loaded above the feed', async () => {
    installations = [installation({})];
    events = [event({ plugin: { pluginId: 'p2', displayName: 'Other', ownerName: 'acme' } })];
    renderPage();

    expect(screen.getByRole('heading', { name: 'Restore a removed plugin' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Removed plugins' }).textContent).toContain(
      'Dashboards'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Restore Dashboards' }));

    expect(await screen.findByText('Install this plugin?')).toBeTruthy();
  });

  it('lists no removed plugins under the Publications filter', () => {
    installations = [installation({})];
    renderPage();
    expect(screen.getByRole('list', { name: 'Removed plugins' })).toBeTruthy();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Publications' }));

    expect(screen.queryByRole('list', { name: 'Removed plugins' })).toBeNull();
  });

  it('keeps a plugin out of the block when its removal is loaded inline', () => {
    installations = [installation({})];
    events = [event({ action: 'uninstall' })];
    renderPage();

    expect(screen.queryByRole('heading', { name: 'Restore a removed plugin' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Restore Dashboards' })).toHaveLength(1);
  });

  it('shows no empty state when the history failed to load', () => {
    isError = true;
    renderPage();

    expect(screen.queryByText('No plugin history yet')).toBeNull();
  });

  it('offers a retry when the first load failed', () => {
    isError = true;
    renderPage();

    expect(screen.getByText('Plugin history could not be loaded.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(retry).toHaveBeenCalled();
  });

  it('says why Restore is missing when installations failed to load', () => {
    installationsError = true;
    const note = 'Restore is unavailable because your installations could not be loaded.';
    renderPage();
    expect(screen.getByText(note)).toBeTruthy();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Publications' }));

    expect(screen.queryByText(note)).toBeNull();
  });

  it('shows the removed-plugin block under the Installations filter', () => {
    installations = [installation({})];
    renderPage();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Installations' }));

    expect(screen.getByRole('heading', { name: 'Restore a removed plugin' })).toBeTruthy();
  });

  it('shows the Installations and Publications empty states', () => {
    renderPage();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Installations' }));
    expect(screen.getByText('Nothing installed yet')).toBeTruthy();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Publications' }));
    expect(screen.getByText('Nothing published yet')).toBeTruthy();
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
