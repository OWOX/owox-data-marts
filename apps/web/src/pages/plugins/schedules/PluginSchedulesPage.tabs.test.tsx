import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let isAdmin = false;

vi.mock('../../../features/idp/hooks/useRole', () => ({ useIsAdmin: () => isAdmin }));
vi.mock('../../../shared/hooks', async () => ({
  ...(await vi.importActual<typeof import('../../../shared/hooks')>('../../../shared/hooks')),
  useProjectId: () => 'project-1',
  useProjectRoute: () => ({
    scope: (path: string) => `/ui/project-1${path}`,
    navigate: vi.fn(),
    projectId: 'project-1',
  }),
}));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { default: toast };
});
vi.mock('../../../features/plugins/services/plugins.service', () => ({
  pluginsService: {
    listRuns: vi.fn(),
    getRun: vi.fn(),
    cancelRun: vi.fn(),
    listSchedules: vi.fn(),
  },
}));

import toast from 'react-hot-toast';
import { pluginsService } from '../../../features/plugins/services/plugins.service';
import PluginSchedulesPage from './PluginSchedulesPage';

function Location() {
  const { search } = useLocation();
  return <output data-testid='location'>{search}</output>;
}

describe('PluginSchedulesPage with the real tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdmin = false;
  });

  it('keeps a runs link to a deleted schedule: no toast, filter stays', async () => {
    vi.mocked(pluginsService.listSchedules).mockResolvedValue([]);
    vi.mocked(pluginsService.listRuns).mockResolvedValue({ items: [], nextCursor: null });

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/?tab=runs&schedule=9b2e4a6c-1d3f-4e5a-8b7c-6d5e4f3a2b1c']}>
          <PluginSchedulesPage />
          <Location />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(pluginsService.listSchedules).toHaveBeenCalled();
    });
    expect(await screen.findByText('No runs match these filters')).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalledWith(
      'This schedule no longer exists.',
      expect.anything()
    );
    expect(screen.getByTestId('location').textContent).toContain(
      'schedule=9b2e4a6c-1d3f-4e5a-8b7c-6d5e4f3a2b1c'
    );
  });
});
