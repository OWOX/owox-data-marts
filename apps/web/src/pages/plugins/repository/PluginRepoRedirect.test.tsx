import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginPageMessage as ActualPluginPageMessage } from '../../../features/plugins/components/PluginPageMessage';

const lookupByRepository = vi.fn();
vi.mock('../../../features/plugins', () => ({
  pluginsService: { lookupByRepository: (repository: string) => lookupByRepository(repository) },
  PluginPageMessage: ActualPluginPageMessage,
}));
vi.mock('../../../shared/hooks', () => ({
  useProjectId: () => 'project-1',
  useProjectRoute: () => ({ scope: (path: string) => `/ui/project-1${path}` }),
}));

import PluginRepoRedirect from './PluginRepoRedirect';

function Where() {
  const location = useLocation();
  return <p>at {`${location.pathname}${location.search}${location.hash}`}</p>;
}

const renderAt = (path: string) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path='/ui/:projectId/plugins/github/:owner/:repo/*'
            element={<PluginRepoRedirect />}
          />
          <Route path='*' element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('PluginRepoRedirect', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the plugin page found for the repository, keeping the query and hash', async () => {
    lookupByRepository.mockResolvedValue({ pluginId: 'p1' });

    renderAt('/ui/project-1/plugins/github/OWOX/odm-usage-stat?utm_source=owox.com#top');

    expect(
      await screen.findByText('at /ui/project-1/plugins/p1?utm_source=owox.com#top')
    ).toBeInTheDocument();
    expect(lookupByRepository).toHaveBeenCalledWith('OWOX/odm-usage-stat');
  });

  it('carries an inner route along', async () => {
    lookupByRepository.mockResolvedValue({ pluginId: 'p1' });

    renderAt('/ui/project-1/plugins/github/OWOX/odm-usage-stat/open/d/42');

    expect(await screen.findByText('at /ui/project-1/plugins/p1/open/d/42')).toBeInTheDocument();
  });

  it.each([
    ['/open', '/open'],
    ['/open?tab=2', '/open?tab=2'],
    ['/open#top', '/open#top'],
    ['/open/d/42?tab=2#top', '/open/d/42?tab=2#top'],
  ])('forwards the open tail %s', async (tail, forwarded) => {
    lookupByRepository.mockResolvedValue({ pluginId: 'p1' });

    renderAt(`/ui/project-1/plugins/github/OWOX/odm-usage-stat${tail}`);

    expect(await screen.findByText(`at /ui/project-1/plugins/p1${forwarded}`)).toBeInTheDocument();
  });

  it.each([
    ['another page', '/history', ''],
    ['a look-alike of open', '/opened/d/1', ''],
    ['a nested path', '/x/open/d/1', ''],
    ['another page with a query and hash', '/settings?utm_source=x#h', '?utm_source=x#h'],
  ])('lands on the plugin page for %s', async (_label, tail, kept) => {
    lookupByRepository.mockResolvedValue({ pluginId: 'p1' });

    renderAt(`/ui/project-1/plugins/github/OWOX/odm-usage-stat${tail}`);

    expect(await screen.findByText(`at /ui/project-1/plugins/p1${kept}`)).toBeInTheDocument();
  });

  it('keeps encoded characters of the inner route encoded', async () => {
    lookupByRepository.mockResolvedValue({ pluginId: 'p1' });

    renderAt('/ui/project-1/plugins/github/OWOX/odm-usage-stat/open/a%3Fb%2Fc%25d?x=1#h');

    expect(
      await screen.findByText('at /ui/project-1/plugins/p1/open/a%3Fb%2Fc%25d?x=1#h')
    ).toBeInTheDocument();
  });

  it('says so when the repository has no plugin here', async () => {
    lookupByRepository.mockRejectedValue(new Error('404'));

    renderAt('/ui/project-1/plugins/github/OWOX/nothing');

    expect(await screen.findByText("This plugin isn't available here")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to plugins' })).toHaveAttribute(
      'href',
      '/ui/project-1/plugins'
    );
  });
});
