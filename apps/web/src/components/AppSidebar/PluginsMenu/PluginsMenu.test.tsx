import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { SidebarProvider } from '@owox/ui/components/sidebar';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
}));
// The real UninstallPluginDialog stays: what it asks before uninstalling is part of the menu.
vi.mock('../../../features/plugins', async () => {
  const actual = await vi.importActual<typeof import('../../../features/plugins')>(
    '../../../features/plugins'
  );
  return {
    ...actual,
    usePluginInstallations: vi.fn(),
    usePluginGallery: vi.fn(),
    usePluginActions: vi.fn(),
  };
});

import {
  usePluginActions,
  usePluginGallery,
  usePluginInstallations,
} from '../../../features/plugins';
import { PluginsMenu } from './PluginsMenu';

const installations = usePluginInstallations as unknown as ReturnType<typeof vi.fn>;
const gallery = usePluginGallery as unknown as ReturnType<typeof vi.fn>;
const actions = usePluginActions as unknown as ReturnType<typeof vi.fn>;
const uninstall = vi.fn();

const installation = (overrides = {}) => ({
  installationId: 'i1',
  pluginId: 'p1',
  displayName: 'Example Plugin',
  uninstalledAt: null,
  ...overrides,
});

const galleryPlugin = (overrides = {}) => ({
  pluginId: 'p1',
  displayName: 'Example Plugin',
  suspended: false,
  currentVersionId: 'v1',
  ...overrides,
});

/** Where the router is now, so a test can see the menu move the member. */
function CurrentPath() {
  return <output data-testid='current-path'>{useLocation().pathname}</output>;
}

// SidebarMenu* read layout state from context, so the provider is required even though
// nothing here asserts on it.
const renderMenu = (path = '/ui/project-1/plugins') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarProvider>
        <PluginsMenu />
        <CurrentPath />
      </SidebarProvider>
    </MemoryRouter>
  );

const currentPath = () => screen.getByTestId('current-path').textContent;

const isHighlighted = (name: string) =>
  screen.getByRole('link', { name }).className.includes('bg-sidebar-active');

describe('PluginsMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installations.mockReturnValue({ installations: [], isLoading: false });
    gallery.mockReturnValue({ plugins: [galleryPlugin()], isLoading: false });
    uninstall.mockResolvedValue(undefined);
    actions.mockReturnValue({ uninstall, isUninstalling: false });
  });

  it('hides when the gallery has no installable plugin', () => {
    gallery.mockReturnValue({ plugins: [], isLoading: false });

    renderMenu();

    expect(screen.queryByText('Plugins')).not.toBeInTheDocument();
  });

  it('stays while the member has an installed plugin, even with an empty gallery', () => {
    gallery.mockReturnValue({ plugins: [], isLoading: false });
    installations.mockReturnValue({ installations: [installation()], isLoading: false });

    renderMenu();

    expect(screen.getByRole('link', { name: 'Plugins' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Example Plugin' })).toHaveAttribute(
      'href',
      '/ui/project-1/plugins/p1/open'
    );
  });

  it('hides with an empty gallery when the only installation was removed', () => {
    gallery.mockReturnValue({ plugins: [], isLoading: false });
    installations.mockReturnValue({
      installations: [installation({ uninstalledAt: '2026-07-01T00:00:00Z' })],
      isLoading: false,
    });

    renderMenu();

    expect(screen.queryByText('Plugins')).not.toBeInTheDocument();
  });

  it('hides while gallery data is still loading', () => {
    gallery.mockReturnValue({ plugins: [], isLoading: true });

    renderMenu();

    expect(screen.queryByText('Plugins')).not.toBeInTheDocument();
  });

  it('hides while the gallery is loading, even with an installed plugin', () => {
    gallery.mockReturnValue({ plugins: [], isLoading: true });
    installations.mockReturnValue({ installations: [installation()], isLoading: false });

    renderMenu();

    expect(screen.queryByText('Plugins')).not.toBeInTheDocument();
  });

  it('hides while installations are loading, even with an installable plugin', () => {
    installations.mockReturnValue({ installations: [], isLoading: true });

    renderMenu();

    expect(screen.queryByText('Plugins')).not.toBeInTheDocument();
  });

  it('hides suspended plugins without a current version as non-installable', () => {
    gallery.mockReturnValue({
      plugins: [galleryPlugin({ suspended: true, currentVersionId: null })],
      isLoading: false,
    });

    renderMenu();

    expect(screen.queryByText('Plugins')).not.toBeInTheDocument();
  });

  it('appears once at least one installable gallery plugin exists', () => {
    renderMenu();

    expect(screen.getByText('Plugins')).toBeInTheDocument();
  });

  it('lists one submenu entry per live installation', () => {
    installations.mockReturnValue({
      installations: [
        installation(),
        installation({ installationId: 'i2', displayName: 'Second Plugin' }),
      ],
      isLoading: false,
    });

    renderMenu();

    expect(screen.getByRole('link', { name: 'Example Plugin' })).toHaveAttribute(
      'href',
      '/ui/project-1/plugins/p1/open'
    );
    expect(screen.getByRole('link', { name: 'Second Plugin' })).toBeInTheDocument();
  });

  describe('highlighting', () => {
    beforeEach(() => {
      installations.mockReturnValue({ installations: [installation()], isLoading: false });
    });

    // Two highlighted rows would claim the reader is in two places at once.
    it('highlights only the plugin while its page is open', () => {
      renderMenu('/ui/project-1/plugins/p1/open/d/42');

      expect(isHighlighted('Example Plugin')).toBe(true);
      expect(isHighlighted('Plugins')).toBe(false);
    });

    it('highlights the plugin at its bare open address', () => {
      renderMenu('/ui/project-1/plugins/p1/open');

      expect(isHighlighted('Example Plugin')).toBe(true);
      expect(isHighlighted('Plugins')).toBe(false);
    });

    /**
     * History, a plugin's own page and the open address of a plugin the member has not
     * installed have no entry of their own, so the parent still has to answer "where am I".
     */
    it.each([
      '/ui/project-1/plugins',
      '/ui/project-1/plugins/history',
      '/ui/project-1/plugins/p1',
      '/ui/project-1/plugins/p2/open',
      '/ui/project-1/plugins/p2/open/d/42',
    ])('highlights Plugins on %s', path => {
      renderMenu(path);

      expect(isHighlighted('Plugins')).toBe(true);
      expect(isHighlighted('Example Plugin')).toBe(false);
    });
  });

  // Uninstalling removes the shortcut but keeps the plugin restorable from history.
  it('drops a removed installation from the submenu', () => {
    installations.mockReturnValue({
      installations: [installation({ uninstalledAt: '2026-07-01T00:00:00Z' })],
      isLoading: false,
    });

    renderMenu();

    expect(screen.queryByRole('link', { name: 'Example Plugin' })).not.toBeInTheDocument();
  });

  /**
   * The submenu lists installations, not Gallery listings, so a plugin can stay here after
   * it leaves the Gallery. Its own row is where a member looks for a way to remove it.
   */
  describe('row menu', () => {
    const openRowMenu = (name = 'Example Plugin') => {
      fireEvent.keyDown(screen.getByRole('button', { name: `More actions for ${name}` }), {
        key: 'Enter',
      });
    };

    const confirmUninstall = () => {
      openRowMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Uninstall' }));
      fireEvent.click(
        within(screen.getByRole('dialog', { name: 'Uninstall this plugin?' })).getByRole('button', {
          name: 'Uninstall',
        })
      );
    };

    beforeEach(() => {
      installations.mockReturnValue({ installations: [installation()], isLoading: false });
    });

    it('gives every installed plugin a menu of its own', () => {
      installations.mockReturnValue({
        installations: [
          installation(),
          installation({ installationId: 'i2', pluginId: 'p2', displayName: 'Second Plugin' }),
        ],
        isLoading: false,
      });
      renderMenu();

      expect(screen.getByRole('button', { name: 'More actions for Example Plugin' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'More actions for Second Plugin' })).toBeTruthy();
    });

    it('opens the plugin page from Settings, even when nothing lists the plugin', () => {
      gallery.mockReturnValue({ plugins: [], isLoading: false });
      renderMenu();
      openRowMenu();

      expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute(
        'href',
        '/ui/project-1/plugins/p1'
      );
    });

    it('uninstalls only after the member confirms', async () => {
      renderMenu();
      openRowMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Uninstall' }));

      expect(screen.getByRole('dialog', { name: 'Uninstall this plugin?' })).toBeTruthy();
      expect(uninstall).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }));

      await waitFor(() => {
        expect(uninstall).toHaveBeenCalledWith('p1');
      });
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Uninstall this plugin?' })).toBeNull();
      });
    });

    it('keeps the plugin when the member cancels', () => {
      renderMenu();
      openRowMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Uninstall' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(uninstall).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: 'Uninstall this plugin?' })).toBeNull();
    });

    // The hook has already toasted the reason; closing would hide the retry.
    it('keeps the confirmation open when the uninstall fails', async () => {
      uninstall.mockRejectedValue(new Error('refused'));
      renderMenu();
      confirmUninstall();

      await waitFor(() => {
        expect(uninstall).toHaveBeenCalledWith('p1');
      });
      expect(screen.getByRole('dialog', { name: 'Uninstall this plugin?' })).toBeTruthy();
    });

    // An open address with no installation behind it offers the install, which is the
    // opposite of what the member just asked for.
    it("leaves the plugin's open address for its page before uninstalling", async () => {
      renderMenu('/ui/project-1/plugins/p1/open/d/42');
      confirmUninstall();

      await waitFor(() => {
        expect(uninstall).toHaveBeenCalledWith('p1');
      });
      expect(currentPath()).toBe('/ui/project-1/plugins/p1');
    });

    it('leaves the member where they are when they uninstall from elsewhere', async () => {
      renderMenu('/ui/project-1/data-marts');
      confirmUninstall();

      await waitFor(() => {
        expect(uninstall).toHaveBeenCalledWith('p1');
      });
      expect(currentPath()).toBe('/ui/project-1/data-marts');
    });
  });
});
