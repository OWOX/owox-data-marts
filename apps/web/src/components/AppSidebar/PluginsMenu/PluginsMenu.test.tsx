import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SidebarProvider } from '@owox/ui/components/sidebar';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
}));
vi.mock('../../../features/plugins', () => ({
  usePluginInstallations: vi.fn(),
  usePluginGallery: vi.fn(),
}));

import { usePluginGallery, usePluginInstallations } from '../../../features/plugins';
import { PluginsMenu } from './PluginsMenu';

const installations = usePluginInstallations as unknown as ReturnType<typeof vi.fn>;
const gallery = usePluginGallery as unknown as ReturnType<typeof vi.fn>;

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

// SidebarMenu* read layout state from context, so the provider is required even though
// nothing here asserts on it.
const renderMenu = (path = '/ui/project-1/plugins') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarProvider>
        <PluginsMenu />
      </SidebarProvider>
    </MemoryRouter>
  );

const isHighlighted = (name: string) =>
  screen.getByRole('link', { name }).className.includes('bg-sidebar-active');

describe('PluginsMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installations.mockReturnValue({ installations: [], isLoading: false });
    gallery.mockReturnValue({ plugins: [galleryPlugin()], isLoading: false });
  });

  it('hides when the gallery has no installable plugin', () => {
    gallery.mockReturnValue({ plugins: [], isLoading: false });

    renderMenu();

    expect(screen.queryByText('Plugins')).not.toBeInTheDocument();
  });

  it('hides while gallery data is still loading', () => {
    gallery.mockReturnValue({ plugins: [], isLoading: true });

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
      '/ui/project-1/plugins/run/i1'
    );
    expect(screen.getByRole('link', { name: 'Second Plugin' })).toBeInTheDocument();
  });

  describe('highlighting', () => {
    beforeEach(() => {
      installations.mockReturnValue({ installations: [installation()], isLoading: false });
    });

    // Two highlighted rows would claim the reader is in two places at once.
    it('highlights only the plugin while its page is open', () => {
      renderMenu('/ui/project-1/plugins/run/i1');

      expect(isHighlighted('Example Plugin')).toBe(true);
      expect(isHighlighted('Plugins')).toBe(false);
    });

    /**
     * History and a plugin's own page have no entry of their own, so the parent still
     * has to answer "where am I" for them.
     */
    it.each(['/ui/project-1/plugins', '/ui/project-1/plugins/history', '/ui/project-1/plugins/p1'])(
      'highlights Plugins on %s',
      path => {
        renderMenu(path);

        expect(isHighlighted('Plugins')).toBe(true);
        expect(isHighlighted('Example Plugin')).toBe(false);
      }
    );
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
});
