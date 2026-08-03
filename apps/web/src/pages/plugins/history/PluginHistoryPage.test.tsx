import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstalledPlugin } from '../../../features/plugins';

let installations: InstalledPlugin[] = [];
const navigate = vi.fn();
const install = vi.fn();

vi.mock('../../../features/plugins', () => ({
  usePluginInstallations: () => ({ installations, isLoading: false }),
  usePluginActions: () => ({ install, isInstalling: false }),
  InstallPluginDialog: ({ open }: { open: boolean }) => (open ? <div>confirm dialog</div> : null),
}));
vi.mock('../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

import PluginHistoryPage from './PluginHistoryPage';

const installation = (over: Partial<InstalledPlugin>): InstalledPlugin => ({
  pluginId: 'p1',
  displayName: 'Example Plugin',
  description: 'Does something',
  currentSemver: '1.0.0',
  currentVersionId: 'v1',
  visibleViaScopes: [],
  suspended: false,
  installationState: 'uninstalled',
  source: { ownerName: 'owox', ownerUrl: 'https://github.com/owox' },
  addedAt: '2026-07-01T00:00:00.000Z',
  installationId: 'i1',
  installedAt: '2026-07-01T00:00:00.000Z',
  uninstalledAt: '2026-07-10T00:00:00.000Z',
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
  });

  /**
   * A plugin nobody publishes any more is gone from the Gallery, and §13 still entitles a
   * previous installer to restore it. This page is the only surface where that happens.
   */
  it('offers Restore for a removed installation and opens its page', () => {
    installations = [installation({})];
    renderPage();

    expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy();

    // The whole card navigates, so a member can reach the page from anywhere on it.
    fireEvent.click(screen.getByRole('link', { name: 'Example Plugin' }));
    expect(navigate).toHaveBeenCalledWith('/ui/project-1/plugins/p1');
  });

  /**
   * Withdrawing a publication removes a plugin from the Gallery without uninstalling
   * anyone, so an installed plugin can end up listed nowhere while still running. Its own
   * page owns uninstall and update, and this is the only surface that still reaches it.
   */
  it('lists a still-installed plugin and links to its page', () => {
    installations = [
      installation({}),
      installation({
        installationId: 'i2',
        pluginId: 'p2',
        displayName: 'Live Plugin',
        installationState: 'installed',
        uninstalledAt: null,
      }),
    ];
    renderPage();

    expect(screen.getByText('Installed')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Live Plugin' }));
    expect(navigate).toHaveBeenCalledWith('/ui/project-1/plugins/p2');
    // Restore belongs to the removed one only.
    expect(screen.getAllByRole('button', { name: 'Restore' })).toHaveLength(1);
  });

  it('says nothing is installed only when the member has no history at all', () => {
    installations = [installation({ installationState: 'installed', uninstalledAt: null })];
    renderPage();

    expect(screen.queryByText('Nothing installed yet')).toBeNull();
    expect(screen.getByText('Installed')).toBeTruthy();
  });

  // A suspended plugin cannot be restored, but stays listed rather than vanishing.
  it('blocks restoring a suspended plugin without hiding it', () => {
    installations = [installation({ suspended: true })];
    renderPage();

    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled();
    expect(screen.getByText('Unavailable')).toBeTruthy();
  });

  /**
   * Restore uses the same Install confirmation as a first install. Backend reactivates
   * the soft-uninstalled row; UI still re-asks after uninstall.
   */
  it('asks before restoring', async () => {
    installations = [installation({})];
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(await screen.findByText('confirm dialog')).toBeTruthy();
    expect(install).not.toHaveBeenCalled();
  });
});
