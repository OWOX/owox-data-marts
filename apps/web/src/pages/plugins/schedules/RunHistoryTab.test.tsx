import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginRun, ProjectPluginSchedule } from '../../../features/plugins';

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
import { RunHistoryTab } from './RunHistoryTab';

const service = vi.mocked(pluginsService);

const run = (over: Partial<PluginRun> = {}): PluginRun => ({
  id: 'r1',
  pluginId: '0f8fad5b-d9cb-469f-a165-70867728950e',
  pluginName: 'Sheets Sync',
  pluginVersion: '1.2.0',
  action: 'sync',
  status: 'SUCCEEDED',
  trigger: 'frontend',
  scheduleId: null,
  scheduleName: null,
  owner: { userId: 'u1', fullName: 'Alice Doe', email: 'alice@example.com', avatar: null },
  createdAt: '2026-10-17T10:00:00.000Z',
  queuedAt: null,
  startedAt: '2026-10-17T10:00:00.000Z',
  finishedAt: '2026-10-17T10:00:05.000Z',
  timeLimitSeconds: 60,
  errorCode: null,
  errorMessage: null,
  errorMessageCleared: false,
  canCancel: false,
  ...over,
});

const nightly: ProjectPluginSchedule = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  name: 'Nightly',
  action: 'sync',
  cron: '0 2 * * *',
  timeZone: 'UTC',
  enabled: true,
  disabledReason: null,
  nextRunAt: null,
  lastRun: null,
  createdAt: '2026-10-16T10:00:00.000Z',
  modifiedAt: '2026-10-16T10:00:00.000Z',
  pluginId: '0f8fad5b-d9cb-469f-a165-70867728950e',
  pluginName: 'Sheets Sync',
  installationId: 'i1',
  installationState: 'installed',
  owner: null,
  ownerIsMember: true,
  canManage: true,
};

const page = (items: PluginRun[], nextCursor: string | null = null) => ({ items, nextCursor });

function Location() {
  const { search } = useLocation();
  return <output data-testid='location'>{search}</output>;
}

const currentSearch = () => screen.getByTestId('location').textContent;

let client: QueryClient;
function renderTab({
  isAdmin = false,
  url = '/?tab=runs',
}: { isAdmin?: boolean; url?: string } = {}) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <RunHistoryTab isAdmin={isAdmin} />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('RunHistoryTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.listSchedules.mockResolvedValue([]);
  });

  it('expands a run into its details and collapses it again', async () => {
    service.listRuns.mockResolvedValue(
      page([
        run({
          id: 'r1',
          status: 'FAILED',
          errorCode: 'DOC_LOCKED',
          errorMessage: 'The document is locked',
        }),
        run({ id: 'r2', action: 'export' }),
      ])
    );
    renderTab();
    const toggle = await screen.findByRole('button', { name: 'Failed run of sync' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(currentSearch()).toBe('?tab=runs&run=r1');
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Run ID: r1')).toBeInTheDocument();
    expect(screen.getByTitle('Copy run ID to clipboard')).toBeInTheDocument();
    expect(screen.getByText('DOC_LOCKED')).toBeInTheDocument();
    expect(screen.getByText('The document is locked')).toBeInTheDocument();
    expect(screen.getByText('v1.2.0')).toBeInTheDocument();
    expect(screen.getByText('1 min 0 sec')).toBeInTheDocument();
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.queryByText('Run ID: r1')).toBeNull();
    });
    expect(currentSearch()).toBe('?tab=runs');
  });

  it('says when the 24-hour sweep cleared the message', async () => {
    service.listRuns.mockResolvedValue(
      page([
        run({
          status: 'FAILED',
          errorCode: 'DOC_LOCKED',
          errorMessage: null,
          errorMessageCleared: true,
        }),
      ])
    );

    renderTab({ url: '/?tab=runs&run=r1' });

    expect(await screen.findByText('Message cleared after 24 hours')).toBeInTheDocument();
  });

  it('names the source: a schedule links to its panel, a deleted one and the plugin page do not', async () => {
    service.listRuns.mockResolvedValue(
      page([
        run({
          id: 'r1',
          action: 'a1',
          trigger: 'schedule',
          scheduleId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
          scheduleName: 'Nightly',
        }),
        run({
          id: 'r2',
          action: 'a2',
          trigger: 'schedule',
          scheduleId: 's-gone',
          scheduleName: null,
        }),
        run({ id: 'r3', action: 'a3' }),
      ])
    );

    renderTab({ url: '/?tab=runs&plugin=0f8fad5b-d9cb-469f-a165-70867728950e' });

    expect(await screen.findByRole('link', { name: 'Nightly' })).toHaveAttribute(
      'href',
      '/?schedule=7c9e6679-7425-40de-944b-e07fc1f90ae7&plugin=0f8fad5b-d9cb-469f-a165-70867728950e'
    );
    expect(screen.getByText('Deleted schedule')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Deleted schedule' })).toBeNull();
    expect(screen.getAllByRole('listitem')[2]).toHaveTextContent('a3 run from plugin page');
  });

  it('shows when a started run began as a relative time', async () => {
    service.listRuns.mockResolvedValue(
      page([run({ startedAt: new Date(Date.now() - 5 * 60_000).toISOString() })])
    );

    renderTab();

    expect(await screen.findByText('5 minutes ago')).toBeInTheDocument();
  });

  it('shows a queued run as Queued with how long ago it queued, and no duration', async () => {
    service.listRuns.mockResolvedValue(
      page([
        run({
          status: 'QUEUED',
          queuedAt: new Date().toISOString(),
          startedAt: null,
          finishedAt: null,
          timeLimitSeconds: null,
        }),
      ])
    );

    renderTab();

    expect(await screen.findByRole('button', { name: 'Queued run of sync' })).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('Queued Just now');
    expect(screen.getByRole('listitem')).not.toHaveTextContent(/\d+ sec/);
  });

  it('reads the filters from the URL, sends them, and keeps the status menu open while choosing', async () => {
    service.listRuns.mockResolvedValue(page([run()]));
    renderTab({ isAdmin: true, url: '/?tab=runs&status=FAILED&source=schedule&owner=u1' });
    await screen.findByRole('button', { name: 'Succeeded run of sync' });
    expect(service.listRuns).toHaveBeenCalledWith(
      { statuses: ['FAILED'], trigger: 'schedule', userId: 'u1' },
      undefined
    );
    expect(screen.getByRole('button', { name: 'Source: Schedule' })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Status: Failed' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Timed out' }));

    await waitFor(() => {
      expect(currentSearch()).toBe(
        '?tab=runs&source=schedule&owner=u1&status=FAILED&status=TIMED_OUT'
      );
    });
    await waitFor(() => {
      expect(service.listRuns).toHaveBeenLastCalledWith(
        { statuses: ['FAILED', 'TIMED_OUT'], trigger: 'schedule', userId: 'u1' },
        undefined
      );
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('shows the owner of a run and the Owner filter to an admin only', async () => {
    service.listRuns.mockResolvedValue(page([run()]));

    const { unmount } = renderTab({ isAdmin: true });
    await screen.findByRole('button', { name: 'Succeeded run of sync' });
    expect(screen.getByText('Alice Doe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Owner: All' })).toBeInTheDocument();
    unmount();

    renderTab({ url: '/?tab=runs&owner=u1' });
    await screen.findByRole('button', { name: 'Succeeded run of sync' });
    expect(service.listRuns).toHaveBeenLastCalledWith({ statuses: [] }, undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Succeeded run of sync' }));
    expect(await screen.findByText('Time limit')).toBeInTheDocument();
    expect(screen.queryByText('Alice Doe')).toBeNull();
    expect(screen.queryByText('Owner')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Owner:/ })).toBeNull();
  });

  it('filters to a schedule from a link, names it on a chip, and drops it', async () => {
    service.listSchedules.mockResolvedValue([nightly]);
    service.listRuns.mockResolvedValue(page([run()]));

    renderTab({ url: '/?tab=runs&schedule=7c9e6679-7425-40de-944b-e07fc1f90ae7' });

    expect(await screen.findByText('Schedule: Nightly')).toBeInTheDocument();
    expect(service.listRuns).toHaveBeenCalledWith(
      { statuses: [], scheduleId: '7c9e6679-7425-40de-944b-e07fc1f90ae7' },
      undefined
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove schedule filter' }));
    await waitFor(() => {
      expect(currentSearch()).toBe('?tab=runs');
    });
    expect(screen.queryByText(/^Schedule:/)).toBeNull();
  });

  it('loads more with the cursor of the last page', async () => {
    service.listRuns
      .mockResolvedValueOnce(page([run({ id: 'r1', action: 'first' })], 'c1'))
      .mockResolvedValueOnce(page([run({ id: 'r2', action: 'second' })]));
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(
      await screen.findByRole('button', { name: 'Succeeded run of second' })
    ).toBeInTheDocument();
    expect(service.listRuns).toHaveBeenLastCalledWith({ statuses: [] }, 'c1');
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('expands and scrolls to a linked run that is in the list', async () => {
    const scroll = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);
    service.listRuns.mockResolvedValue(
      page([run({ id: 'r1', action: 'a1' }), run({ id: 'r2', action: 'a2' })])
    );

    renderTab({ url: '/?tab=runs&run=r2' });

    expect(await screen.findByText('Run ID: r2')).toBeInTheDocument();
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
    expect(service.getRun).not.toHaveBeenCalled();
    expect(screen.queryByText('Linked run')).toBeNull();
    scroll.mockRestore();
  });

  it('shows a linked run that no loaded page holds at the top, marked and expanded', async () => {
    service.listRuns.mockResolvedValue(page([run({ id: 'r1', action: 'listed' })], 'c1'));
    service.getRun.mockResolvedValue(
      run({ id: '9b2f4c1e-3d5a-4e6f-8a7b-0c1d2e3f4a5b', action: 'linked', status: 'FAILED' })
    );

    renderTab({ url: '/?tab=runs&run=9b2f4c1e-3d5a-4e6f-8a7b-0c1d2e3f4a5b' });

    expect(await screen.findByText('Linked run')).toBeInTheDocument();
    expect(service.getRun).toHaveBeenCalledWith('9b2f4c1e-3d5a-4e6f-8a7b-0c1d2e3f4a5b');
    expect(
      screen
        .getAllByRole('button', { name: / run of / })
        .map(button => button.getAttribute('aria-label'))
    ).toEqual(['Failed run of linked', 'Succeeded run of listed']);
    expect(screen.getByText('Run ID: 9b2f4c1e-3d5a-4e6f-8a7b-0c1d2e3f4a5b')).toBeInTheDocument();
  });

  it('says a linked run is gone, drops it from the URL and renders the list, with no retry or spinner', async () => {
    service.listRuns.mockResolvedValue(page([run({ id: 'r1', action: 'listed' })]));
    service.getRun.mockRejectedValue({
      response: {
        status: 404,
        data: { code: 'EXECUTION_NOT_FOUND', message: 'Execution was not found' },
      },
    });

    renderTab({ url: '/?tab=runs&run=0f1e2d3c-4b5a-4968-8776-655443322110' });

    expect(
      await screen.findByRole('button', { name: 'Succeeded run of listed' })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        client.getQueryState([
          'plugin-runs',
          'project-1',
          'run',
          '0f1e2d3c-4b5a-4968-8776-655443322110',
        ])?.status
      ).toBe('error');
    });
    expect(service.getRun).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('This run no longer exists.', {
      id: 'plugin-run-gone',
    });
    await waitFor(() => {
      expect(currentSearch()).toBe('?tab=runs');
    });
    expect(screen.queryByText('Linked run')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(document.querySelector('[data-slot="skeleton"]')).toBeNull();
    expect(screen.getByRole('list', { name: 'Plugin runs' })).toBeInTheDocument();
  });

  it('never asks for a linked run whose id is not a UUID, and reads it as gone', async () => {
    service.listRuns.mockResolvedValue(page([run({ id: 'r1', action: 'listed' })]));

    renderTab({ url: '/?tab=runs&run=..' });

    expect(
      await screen.findByRole('button', { name: 'Succeeded run of listed' })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(currentSearch()).toBe('?tab=runs');
    });
    expect(toast.error).toHaveBeenCalledWith('This run no longer exists.', {
      id: 'plugin-run-gone',
    });
    expect(service.getRun).not.toHaveBeenCalled();
    expect(screen.queryByText('Linked run')).toBeNull();
  });

  it('cancels a run behind a confirmation, and leaves it when the member keeps it running', async () => {
    service.listRuns.mockResolvedValue(
      page([run({ status: 'RUNNING', finishedAt: null, canCancel: true })])
    );
    service.cancelRun.mockResolvedValue(run({ status: 'CANCELLED' }));
    renderTab({ url: '/?tab=runs&run=r1' });

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel run' }));
    let dialog = screen.getByRole('dialog', { name: 'Cancel this run?' });
    expect(within(dialog).getByText('The run stops and is marked Cancelled.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep running' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    });
    expect(service.cancelRun).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }));
    dialog = screen.getByRole('dialog', { name: 'Cancel this run?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel run' }));

    await waitFor(() => {
      expect(service.cancelRun).toHaveBeenCalledWith('r1');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    });
  });

  it('offers Cancel run only with canCancel, and Open schedule only for a schedule that exists', async () => {
    service.listRuns.mockResolvedValue(
      page([
        run({
          id: 'r1',
          action: 'gone',
          status: 'RUNNING',
          finishedAt: null,
          trigger: 'schedule',
          scheduleId: 's-gone',
        }),
        run({
          id: 'r2',
          action: 'kept',
          trigger: 'schedule',
          scheduleId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
          scheduleName: 'Nightly',
        }),
      ])
    );
    renderTab({ url: '/?tab=runs&run=r1' });
    await screen.findByText('Run ID: r1');

    expect(screen.queryByRole('button', { name: 'Cancel run' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open schedule' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Open plugin' })).toHaveAttribute(
      'href',
      '/ui/project-1/plugins/0f8fad5b-d9cb-469f-a165-70867728950e'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Succeeded run of kept' }));

    expect(await screen.findByRole('link', { name: 'Open schedule' })).toHaveAttribute(
      'href',
      '/?schedule=7c9e6679-7425-40de-944b-e07fc1f90ae7'
    );
  });

  it('says when there are no runs, and when the filters match none', async () => {
    service.listRuns.mockResolvedValue(page([]));

    const { unmount } = renderTab();
    expect(await screen.findByText('No runs yet')).toBeInTheDocument();
    expect(
      screen.getByText('Runs are kept for 90 days. Error messages are kept for 24 hours.')
    ).toBeInTheDocument();
    unmount();

    renderTab({ url: '/?tab=runs&status=FAILED' });
    expect(await screen.findByText('No runs match these filters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => {
      expect(currentSearch()).toBe('?tab=runs');
    });
    expect(await screen.findByText('No runs yet')).toBeInTheDocument();
  });

  it('tells the member when a Load more fails, keeps the rows, and offers it again', async () => {
    service.listRuns
      .mockResolvedValueOnce(page([run({ id: 'r1', action: 'first' })], 'c1'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page([run({ id: 'r2', action: 'second' })]));
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    await waitFor(() => {
      expect(service.listRuns).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole('button', { name: 'Succeeded run of first' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(toast.error).toHaveBeenCalledWith('More runs could not be loaded.');
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(
      await screen.findByRole('button', { name: 'Succeeded run of second' })
    ).toBeInTheDocument();
  });

  it('keeps the rows when a silent poll fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    service.listRuns
      .mockResolvedValueOnce(page([run({ status: 'RUNNING', finishedAt: null })]))
      .mockRejectedValue(new Error('offline'));
    try {
      renderTab();
      await screen.findByRole('button', { name: 'Running run of sync' });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(service.listRuns).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('button', { name: 'Running run of sync' })).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows an unknown status as the API sent it', async () => {
    service.listRuns.mockResolvedValue(page([run({ status: 'PAUSED' as PluginRun['status'] })]));

    renderTab();

    expect(await screen.findByRole('button', { name: 'PAUSED run of sync' })).toBeInTheDocument();
  });

  it('says the list failed on a deep link, without reading the linked run', async () => {
    service.listRuns.mockRejectedValue(new Error('offline'));

    renderTab({ url: '/?tab=runs&run=9b2f4c1e-3d5a-4e6f-8a7b-0c1d2e3f4a5b' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Runs could not be loaded.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(service.getRun).not.toHaveBeenCalled();
  });

  it('moves a running duration on every poll, even when the data is the same', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const open = run({
      status: 'RUNNING',
      startedAt: new Date(Date.now() - 10_000).toISOString(),
      finishedAt: null,
    });
    service.listRuns.mockImplementation(() => Promise.resolve(page([{ ...open }])));
    try {
      // The duration shows in the details, as on the Data Mart run history.
      renderTab({ url: '/?tab=runs&run=r1' });
      const row = await screen.findByRole('listitem');
      const before = row.textContent;
      expect(before).toMatch(/\d+ sec/);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(service.listRuns).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('listitem').textContent).not.toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes the confirmation when the cancel is refused', async () => {
    service.listRuns.mockResolvedValue(
      page([run({ status: 'RUNNING', finishedAt: null, canCancel: true })])
    );
    service.cancelRun.mockRejectedValue({ response: { data: { message: 'Too late' } } });
    renderTab({ url: '/?tab=runs&run=r1' });

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel run' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel this run?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel run' }));

    await waitFor(() => {
      expect(service.cancelRun).toHaveBeenCalledWith('r1');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    });
  });

  it('says when the runs could not be loaded and reads them again on Try again', async () => {
    service.listRuns.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(page([run()]));

    renderTab();

    expect(await screen.findByRole('alert')).toHaveTextContent('Runs could not be loaded.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('button', { name: 'Succeeded run of sync' })
    ).toBeInTheDocument();
  });
});
