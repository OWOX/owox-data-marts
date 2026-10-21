import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it, vi } from 'vitest';

// Stubbed to their names: this suite is about which page a path reaches.
vi.mock('../../pages/plugins/detail/PluginDetailsPage', () => ({
  default: () => <p>Plugin details page</p>,
}));
vi.mock('../../pages/plugins/gallery/PluginsGalleryPage', () => ({
  default: () => <p>Plugins page</p>,
}));
vi.mock('../../pages/plugins/history/PluginHistoryPage', () => ({
  default: () => <p>Plugin history page</p>,
}));
vi.mock('../../pages/plugins/open/PluginOpenPage', () => ({ default: () => null }));
vi.mock('../../pages/plugins/repository/PluginRepoRedirect', () => ({ default: () => null }));
vi.mock('../../pages/plugins/runtime/LegacyPluginRunRedirect', () => ({ default: () => null }));
vi.mock('../../pages/plugins/schedules/PluginSchedulesPage', () => ({
  default: () => <p>Plugin schedules page</p>,
}));
vi.mock('../../components/errors', () => ({ LayoutErrorBoundary: () => null }));

import { pluginsRoutes } from './routes';

function renderAt(path: string) {
  return render(
    <RouterProvider router={createMemoryRouter(pluginsRoutes, { initialEntries: [path] })} />
  );
}

describe('pluginsRoutes', () => {
  it('reaches the schedules page, never a plugin called "schedules"', async () => {
    renderAt('/plugins/schedules?tab=runs');

    expect(await screen.findByText('Plugin schedules page')).toBeInTheDocument();
    expect(screen.queryByText('Plugin details page')).toBeNull();
  });

  it('still reaches a plugin by its id', async () => {
    renderAt('/plugins/p1');

    expect(await screen.findByText('Plugin details page')).toBeInTheDocument();
  });
});
