import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let installations: { installationId: string; pluginId: string; uninstalledAt: string | null }[] =
  [];
let detailsMounts = 0;
let runtimeMounts = 0;
vi.mock('../../../features/plugins', async () => {
  const actual = await vi.importActual<
    typeof import('../../../features/plugins/runtime/pluginRoute')
  >('../../../features/plugins/runtime/pluginRoute');
  return {
    usePluginInstallations: () => ({ installations, isLoading: false }),
    routeFromLocation: actual.routeFromLocation,
  };
});
vi.mock('../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
}));
vi.mock('../runtime/PluginRuntimePage', async () => {
  const { useState } = await vi.importActual<typeof import('react')>('react');
  function PluginRuntime(props: {
    installationId: string;
    initialRoute: string;
    openBase: string;
  }) {
    const [mount] = useState(() => ++runtimeMounts);
    return (
      <>
        <p>
          runtime {props.installationId} at {props.initialRoute} under {props.openBase}
        </p>
        <p>runtime mount {mount}</p>
      </>
    );
  }
  return { PluginRuntime };
});
vi.mock('../detail/PluginDetailsPage', async () => {
  const { useState } = await vi.importActual<typeof import('react')>('react');
  function PluginDetailsPage({ installOnOpen }: { installOnOpen?: boolean }) {
    const [mount] = useState(() => ++detailsMounts);
    return (
      <>
        <p>details{installOnOpen ? ' with install' : ''}</p>
        <p>details mount {mount}</p>
      </>
    );
  }
  return { default: PluginDetailsPage };
});

import PluginOpenPage from './PluginOpenPage';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path='/ui/:projectId/plugins/:pluginId/open/*' element={<PluginOpenPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('PluginOpenPage', () => {
  beforeEach(() => {
    installations = [];
    detailsMounts = 0;
    runtimeMounts = 0;
  });

  it('renders the runtime for an installed plugin, suspended or not, at the route', () => {
    installations = [{ installationId: 'i1', pluginId: 'p1', uninstalledAt: null }];
    renderAt('/ui/project-1/plugins/p1/open/d/42?tab=2');
    expect(
      screen.getByText('runtime i1 at /d/42?tab=2 under /ui/project-1/plugins/p1/open')
    ).toBeInTheDocument();
  });

  it('opens at the root when the address names no route', () => {
    installations = [{ installationId: 'i1', pluginId: 'p1', uninstalledAt: null }];
    renderAt('/ui/project-1/plugins/p1/open');
    expect(screen.getByText(/runtime i1 at \/ under/)).toBeInTheDocument();
  });

  it('starts a fresh runtime on moving to another installed plugin', async () => {
    installations = [
      { installationId: 'i1', pluginId: 'p1', uninstalledAt: null },
      { installationId: 'i2', pluginId: 'p2', uninstalledAt: null },
    ];
    render(
      <MemoryRouter initialEntries={['/ui/project-1/plugins/p1/open']}>
        <Link to='/ui/project-1/plugins/p2/open'>Next plugin</Link>
        <Routes>
          <Route path='/ui/:projectId/plugins/:pluginId/open/*' element={<PluginOpenPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('runtime mount 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Next plugin' }));

    expect(await screen.findByText(/runtime i2 at/)).toBeInTheDocument();
    expect(screen.getByText('runtime mount 2')).toBeInTheDocument();
  });

  it('offers the install to a member without the plugin', () => {
    renderAt('/ui/project-1/plugins/p1/open/d/42');
    expect(screen.getByText('details with install')).toBeInTheDocument();
  });

  it("ignores another plugin's installation", () => {
    installations = [{ installationId: 'i9', pluginId: 'p9', uninstalledAt: null }];
    renderAt('/ui/project-1/plugins/p1/open');
    expect(screen.getByText('details with install')).toBeInTheDocument();
  });

  /**
   * Uninstalled while running, from the sidebar's row menu. The page leaves for the plugin's
   * own page instead of offering the install the member just turned down, and only once the
   * installation is really gone.
   */
  it("leaves for the plugin's page when the running plugin is uninstalled", () => {
    installations = [{ installationId: 'i1', pluginId: 'p1', uninstalledAt: null }];
    // A fresh element each time: re-rendering the same one would let React skip the tree.
    const view = () => (
      <MemoryRouter initialEntries={['/ui/project-1/plugins/p1/open/d/42']}>
        <Routes>
          <Route path='/ui/:projectId/plugins/:pluginId/open/*' element={<PluginOpenPage />} />
          <Route path='/ui/:projectId/plugins/:pluginId' element={<p>plugin page</p>} />
        </Routes>
      </MemoryRouter>
    );
    const { rerender } = render(view());
    expect(screen.getByText(/runtime i1 at \/d\/42/)).toBeInTheDocument();

    installations = [];
    rerender(view());

    expect(screen.getByText('plugin page')).toBeInTheDocument();
    expect(screen.queryByText(/details with install/)).toBeNull();
  });

  // Visiting another plugin ends the run: coming back after an uninstall is a fresh visit.
  it('offers the install on returning to a plugin uninstalled while another was open', async () => {
    installations = [{ installationId: 'i1', pluginId: 'p1', uninstalledAt: null }];
    const view = () => (
      <MemoryRouter initialEntries={['/ui/project-1/plugins/p1/open']}>
        <Link to='/ui/project-1/plugins/p2/open'>Other plugin</Link>
        <Link to='/ui/project-1/plugins/p1/open'>Back to the first</Link>
        <Routes>
          <Route path='/ui/:projectId/plugins/:pluginId/open/*' element={<PluginOpenPage />} />
          <Route path='/ui/:projectId/plugins/:pluginId' element={<p>plugin page</p>} />
        </Routes>
      </MemoryRouter>
    );
    const { rerender } = render(view());
    expect(screen.getByText(/runtime i1 at/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Other plugin' }));
    expect(await screen.findByText('details mount 1')).toBeInTheDocument();

    installations = [];
    rerender(view());
    fireEvent.click(screen.getByRole('link', { name: 'Back to the first' }));

    expect(await screen.findByText('details mount 2')).toBeInTheDocument();
    expect(screen.getByText('details with install')).toBeInTheDocument();
    expect(screen.queryByText('plugin page')).toBeNull();
  });

  it('offers the install afresh on moving to another plugin the member lacks', async () => {
    render(
      <MemoryRouter initialEntries={['/ui/project-1/plugins/p1/open']}>
        <Link to='/ui/project-1/plugins/p2/open'>Next plugin</Link>
        <Routes>
          <Route path='/ui/:projectId/plugins/:pluginId/open/*' element={<PluginOpenPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('details mount 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Next plugin' }));

    expect(await screen.findByText('details mount 2')).toBeInTheDocument();
  });
});
