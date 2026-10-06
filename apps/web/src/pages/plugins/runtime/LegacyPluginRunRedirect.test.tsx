import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

let installations: { installationId: string; pluginId: string; uninstalledAt: string | null }[] =
  [];
const isLoading = false;
vi.mock('../../../features/plugins', () => ({
  usePluginInstallations: () => ({ installations, isLoading }),
}));
vi.mock('../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
}));

import LegacyPluginRunRedirect from './LegacyPluginRunRedirect';

function Where() {
  const location = useLocation();
  return <p>at {location.pathname}</p>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path='/ui/:projectId/plugins/run/:installationId'
          element={<LegacyPluginRunRedirect />}
        />
        <Route path='*' element={<Where />} />
      </Routes>
    </MemoryRouter>
  );

describe('LegacyPluginRunRedirect', () => {
  it('sends an old run link to the plugin it belongs to', () => {
    installations = [{ installationId: 'i1', pluginId: 'p1', uninstalledAt: null }];
    renderAt('/ui/project-1/plugins/run/i1');
    expect(screen.getByText('at /ui/project-1/plugins/p1/open')).toBeInTheDocument();
  });

  it('still finds a removed installation, so the member is offered the restore', () => {
    installations = [
      { installationId: 'i1', pluginId: 'p1', uninstalledAt: '2026-10-01T00:00:00Z' },
    ];
    renderAt('/ui/project-1/plugins/run/i1');
    expect(screen.getByText('at /ui/project-1/plugins/p1/open')).toBeInTheDocument();
  });

  it('sends an unknown installation to the gallery', () => {
    installations = [];
    renderAt('/ui/project-1/plugins/run/nope');
    expect(screen.getByText('at /ui/project-1/plugins')).toBeInTheDocument();
  });
});
