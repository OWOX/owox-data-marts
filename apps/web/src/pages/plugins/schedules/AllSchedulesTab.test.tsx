import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectPluginSchedule } from '../../../features/plugins';

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
    listSchedules: vi.fn(),
    pauseSchedule: vi.fn(),
    resumeSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
  },
}));

import toast from 'react-hot-toast';
import { pluginsService } from '../../../features/plugins/services/plugins.service';
import { AllSchedulesTab } from './AllSchedulesTab';

const service = vi.mocked(pluginsService);

const schedule = (over: Partial<ProjectPluginSchedule> = {}): ProjectPluginSchedule => ({
  id: 's1',
  name: 'Morning export',
  action: 'export',
  cron: '0 9 * * *',
  timeZone: 'Europe/Kyiv',
  enabled: true,
  disabledReason: null,
  nextRunAt: '2026-10-18T06:00:00.000Z',
  lastRun: null,
  createdAt: '2026-10-16T10:00:00.000Z',
  modifiedAt: '2026-10-16T10:00:00.000Z',
  pluginId: 'p1',
  pluginName: 'Sheets Sync',
  installationId: 'i1',
  installationState: 'installed',
  owner: { userId: 'u1', fullName: 'Alice Doe', email: 'alice@example.com', avatar: null },
  ownerIsMember: true,
  canManage: true,
  ...over,
});

function Location() {
  const { pathname, search } = useLocation();
  return (
    <>
      <output data-testid='location'>{search}</output>
      <output data-testid='path'>{pathname}</output>
    </>
  );
}

const currentSearch = () => screen.getByTestId('location').textContent;
const currentPath = () => screen.getByTestId('path').textContent;

function renderTab({
  isAdmin = false,
  url = '/',
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
}: { isAdmin?: boolean; url?: string; client?: QueryClient } = {}) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <AllSchedulesTab isAdmin={isAdmin} />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const rowNames = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map(row => within(row).getAllByRole('cell')[0].textContent);

const openMenu = (name: string) => {
  fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' });
  return screen.getByRole('menu');
};

const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr')!;

describe('AllSchedulesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('sorts by next run, soonest first, with no next run last', async () => {
    service.listSchedules.mockResolvedValue([
      schedule({ id: 's1', name: 'Later', nextRunAt: '2026-10-20T06:00:00.000Z' }),
      schedule({ id: 's2', name: 'Paused one', enabled: false, nextRunAt: null }),
      schedule({ id: 's3', name: 'Sooner', nextRunAt: '2026-10-18T06:00:00.000Z' }),
    ]);

    renderTab();

    await screen.findByText('Sooner');
    expect(rowNames()).toEqual(['Sooner', 'Later', 'Paused one']);
    expect(service.listSchedules).toHaveBeenCalledWith(undefined);
  });

  it('shows the action id in monospace after the plugin, and has a column of its own', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);

    renderTab();

    await screen.findByText('Morning export');
    const headers = screen.getAllByRole('columnheader').map(header => header.textContent);
    expect(headers.slice(0, 3)).toEqual(['Name', 'Plugin', 'Action']);
    const cell = within(screen.getAllByRole('row')[1]).getAllByRole('cell')[2];
    expect(cell.querySelector('code')).toHaveTextContent('export');
  });

  it('names each status, and gives Disabled its reason', async () => {
    service.listSchedules.mockResolvedValue([
      schedule({ id: 's1', name: 'A' }),
      schedule({ id: 's2', name: 'B', enabled: false, nextRunAt: null }),
      schedule({
        id: 's3',
        name: 'C',
        enabled: false,
        nextRunAt: null,
        disabledReason: 'INVALID_PARAMETERS',
      }),
      schedule({ id: 's4', name: 'D', installationState: 'uninstalled', nextRunAt: null }),
    ]);

    renderTab();

    await screen.findByText('A');
    for (const label of ['Active', 'Paused', 'Disabled', 'Plugin removed']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    fireEvent.focus(screen.getByText('Disabled').closest('[data-slot="tooltip-trigger"]')!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Its settings no longer match the action'
    );
  });

  it('marks an enabled schedule whose owner left the project, with the reason', async () => {
    service.listSchedules.mockResolvedValue([
      schedule({ id: 's1', name: 'A', ownerIsMember: false }),
    ]);

    renderTab();

    await screen.findByText('A');
    fireEvent.focus(
      screen.getByText('Owner not a member').closest('[data-slot="tooltip-trigger"]')!
    );
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'The owner is no longer a project member, or their account is locked, so its runs are skipped'
    );
  });

  it("shows the next run's date in the schedule's own zone", async () => {
    service.listSchedules.mockResolvedValue([schedule()]);

    renderTab();

    const row = await rowOf('Morning export');
    const nextRun = within(row).getAllByRole('cell')[5];
    fireEvent.focus(nextRun.querySelector('[data-slot="tooltip-trigger"]')!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Oct 18, 2026, 09:00 AM GMT+3');
  });

  it("names the schedule's zone in a tooltip rather than in the row", async () => {
    service.listSchedules.mockResolvedValue([schedule()]);

    renderTab();

    const row = await rowOf('Morning export');
    const cell = within(row).getAllByRole('cell')[3];
    expect(cell).not.toHaveTextContent('Kyiv');
    fireEvent.focus(cell.querySelector('[data-slot="tooltip-trigger"]')!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Kyiv');
  });

  it('shows a cron it cannot describe as written', async () => {
    service.listSchedules.mockResolvedValue([
      schedule(),
      schedule({ id: 's2', name: 'Weekday check', cron: '0 9 * * 1-5' }),
    ]);

    renderTab();

    const scheduleCell = async (name: string) => within(await rowOf(name)).getAllByRole('cell')[3];
    expect(await scheduleCell('Morning export')).toHaveTextContent('Daily at 09:00');
    expect(await scheduleCell('Weekday check')).toHaveTextContent(/^0 9 \* \* 1-5$/);
  });

  it('shows the Owner column and filter to an admin only', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);

    const { unmount } = renderTab();
    await screen.findByText('Morning export');
    expect(screen.queryByRole('columnheader', { name: /Owner/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Owner: All' })).toBeNull();
    unmount();

    renderTab({ isAdmin: true });
    await screen.findByText('Morning export');
    expect(screen.getByRole('columnheader', { name: /Owner/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Owner: All' })).toBeInTheDocument();
    expect(screen.getByText('Alice Doe')).toBeInTheDocument();
  });

  it('opens the side panel from a row and closes it from its corner', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);
    renderTab();

    fireEvent.click(await screen.findByText('Morning export'));

    const panel = await screen.findByRole('dialog', { name: 'Morning export' });
    expect(currentSearch()).toBe('?schedule=s1');
    expect(within(panel).getByText('Daily at 09:00')).toBeInTheDocument();
    expect(within(panel).queryByText('Alice Doe')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Ownership' }));
    expect(within(panel).getByText('Alice Doe')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(currentSearch()).toBe('');
  });

  it('opens the plugin from the side panel header', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);
    renderTab();

    fireEvent.click(await screen.findByText('Morning export'));
    const panel = await screen.findByRole('dialog', { name: 'Morning export' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Open plugin' }));

    expect(currentPath()).toBe('/ui/project-1/plugins/p1');
  });

  it('opens the side panel from the name button, which keyboard users can reach', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);
    renderTab();

    const name = await screen.findByRole('button', { name: 'Morning export' });
    name.focus();
    expect(name).toHaveFocus();
    fireEvent.click(name);

    expect(await screen.findByRole('dialog', { name: 'Morning export' })).toBeInTheDocument();
  });

  it('keeps the same row cells while the URL changes', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);
    renderTab();
    const name = await screen.findByRole('button', { name: 'Morning export' });

    fireEvent.keyDown(screen.getByRole('button', { name: 'Plugin: All' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Sheets Sync' }));

    await waitFor(() => {
      expect(currentSearch()).toBe('?plugin=p1');
    });
    expect(screen.getByRole('button', { name: 'Morning export' })).toBe(name);
  });

  it('reopens the panel when its schedule could not be deleted', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);
    service.deleteSchedule.mockRejectedValue(new Error('refused'));
    renderTab({ url: '/?schedule=s1' });
    const panel = await screen.findByRole('dialog', { name: 'Morning export' });

    fireEvent.click(within(panel).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete Morning export?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(service.deleteSchedule).toHaveBeenCalledWith('s1');
    });
    await waitFor(() => {
      expect(currentSearch()).toBe('?schedule=s1');
    });
    await waitFor(() => {
      expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1);
    });
    expect(screen.getByRole('dialog', { name: 'Morning export' })).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: 'Delete Morning export?', hidden: true })
    ).toBeNull();
  });

  it('opens the side panel from a link', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);

    renderTab({ url: '/?schedule=s1' });

    expect(await screen.findByRole('dialog', { name: 'Morning export' })).toBeInTheDocument();
  });

  it('drops a link to a schedule that no longer exists, with a toast', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);

    renderTab({ url: '/?schedule=s-gone&plugin=p1' });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('This schedule no longer exists.', {
        id: 'plugin-schedule-gone',
      });
    });
    await waitFor(() => {
      expect(currentSearch()).toBe('?plugin=p1');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('waits for the refetch before calling a link to a newer schedule gone', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['plugin-schedules', 'project-1', 'all'], [schedule()]);
    service.listSchedules.mockResolvedValue([
      schedule(),
      schedule({ id: 's9', name: 'Fresh one' }),
    ]);

    renderTab({ url: '/?schedule=s9', client });

    expect(await screen.findByRole('dialog', { name: 'Fresh one' })).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    expect(currentSearch()).toBe('?schedule=s9');
  });

  it('goes back to the first page when the sorting changes', async () => {
    service.listSchedules.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) =>
        schedule({
          id: `s${index}`,
          name: `Sched ${String(index).padStart(2, '0')}`,
          nextRunAt: `2026-10-18T06:${String(index).padStart(2, '0')}:00.000Z`,
        })
      )
    );
    renderTab();
    await screen.findByText('Sched 00');
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
    await screen.findByText('Sched 19');

    fireEvent.click(screen.getByRole('button', { name: /^Name - .*Click to sort/ }));

    expect(await screen.findByText('Sched 00')).toBeInTheDocument();
  });

  it('stays on its page when a poll changes the data', async () => {
    const many = (lastRun: ProjectPluginSchedule['lastRun']) =>
      Array.from({ length: 20 }, (_, index) =>
        schedule({
          id: `s${index}`,
          name: `Sched ${String(index).padStart(2, '0')}`,
          nextRunAt: `2026-10-18T06:${String(index).padStart(2, '0')}:00.000Z`,
          lastRun: index === 19 ? lastRun : null,
        })
      );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    service.listSchedules.mockResolvedValue(many(null));
    renderTab({ client });
    await screen.findByText('Sched 00');

    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(await screen.findByText('Sched 19')).toBeInTheDocument();
    act(() => {
      client.setQueryData(
        ['plugin-schedules', 'project-1', 'all'],
        many({
          executionId: 'e1',
          status: 'FAILED',
          finishedAt: '2026-10-18T05:00:00.000Z',
        } as ProjectPluginSchedule['lastRun'])
      );
    });

    await screen.findByText(/^Failed/);
    expect(screen.getByText('Sched 19')).toBeInTheDocument();
    expect(screen.queryByText('Sched 00')).toBeNull();

    act(() => {
      client.setQueryData(['plugin-schedules', 'project-1', 'all'], many(null).slice(0, 10));
    });

    expect(await screen.findByText('Sched 00')).toBeInTheDocument();
  });

  it('pauses from the row menu and resumes from the side panel', async () => {
    service.listSchedules
      .mockResolvedValueOnce([schedule()])
      .mockResolvedValue([schedule({ enabled: false, nextRunAt: null })]);
    service.pauseSchedule.mockResolvedValue(schedule({ enabled: false, nextRunAt: null }));
    service.resumeSchedule.mockResolvedValue(schedule());
    renderTab();
    await screen.findByText('Morning export');

    fireEvent.click(
      within(openMenu('Actions for Morning export')).getByRole('menuitem', { name: 'Pause' })
    );

    await waitFor(() => {
      expect(service.pauseSchedule).toHaveBeenCalledWith('s1');
    });
    expect(await screen.findByText('Paused')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Morning export'));
    const panel = await screen.findByRole('dialog', { name: 'Morning export' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Resume' }));
    await waitFor(() => {
      expect(service.resumeSchedule).toHaveBeenCalledWith('s1');
    });
  });

  it('offers Resume once the owner left the project, and toasts its refusal', async () => {
    service.listSchedules.mockResolvedValue([
      schedule({
        id: 's1',
        name: 'Orphan',
        enabled: false,
        nextRunAt: null,
        ownerIsMember: false,
      }),
      schedule({
        id: 's2',
        name: 'Undeclared',
        enabled: false,
        nextRunAt: null,
        disabledReason: 'ACTION_NOT_DECLARED',
      }),
    ]);
    renderTab({ url: '/?schedule=s1' });
    const items = (menu: HTMLElement) =>
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent);

    service.resumeSchedule.mockRejectedValue({
      response: {
        data: {
          code: 'OWNER_NOT_MEMBER',
          message:
            'The installation owner is no longer a project member, or their account is locked',
        },
      },
    });

    const panel = await screen.findByRole('dialog', { name: 'Orphan' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Resume' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'The installation owner is no longer a project member, or their account is locked'
      );
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    for (const name of ['Orphan', 'Undeclared']) {
      expect(items(openMenu(`Actions for ${name}`))).toEqual([
        'Resume',
        'View runs',
        'Open plugin',
        'Delete',
      ]);
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByRole('menu')).toBeNull();
      });
    }
  });

  it('toasts a resume the owner check could not answer, so the member can try again', async () => {
    service.listSchedules.mockResolvedValue([schedule({ enabled: false, nextRunAt: null })]);
    service.resumeSchedule.mockRejectedValue({
      response: {
        status: 503,
        data: {
          code: 'OWNER_CHECK_UNAVAILABLE',
          message: 'Could not check the installation owner. Try again shortly.',
        },
      },
    });
    renderTab({ url: '/?schedule=s1' });

    const panel = await screen.findByRole('dialog', { name: 'Morning export' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Resume' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Could not check the installation owner. Try again shortly.'
      );
    });
  });

  it('toasts a refused change with the API message and reads the list again', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);
    service.pauseSchedule.mockRejectedValue({
      response: { data: { code: 'SCHEDULE_BUSY', message: 'The schedule is running' } },
    });
    renderTab();
    await screen.findByText('Morning export');

    fireEvent.click(
      within(openMenu('Actions for Morning export')).getByRole('menuitem', { name: 'Pause' })
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('The schedule is running');
    });
    await waitFor(() => {
      expect(service.listSchedules).toHaveBeenCalledTimes(2);
    });
  });

  it('closes the open panel before deleting, and never says the schedule is gone', async () => {
    service.listSchedules.mockResolvedValueOnce([schedule()]).mockResolvedValue([]);
    service.deleteSchedule.mockResolvedValue(undefined);
    renderTab({ url: '/?schedule=s1' });
    const panel = await screen.findByRole('dialog', { name: 'Morning export' });

    fireEvent.click(within(panel).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete Morning export?' });
    expect(within(confirm).getByText('The plugin can create it again.')).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(service.deleteSchedule).toHaveBeenCalledWith('s1');
    });
    expect(await screen.findByText('No schedules yet')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(currentSearch()).toBe('');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('offers View runs and Delete only for a removed plugin, and no change without canManage', async () => {
    service.listSchedules.mockResolvedValue([
      schedule({ id: 's1', name: 'Removed', installationState: 'uninstalled', nextRunAt: null }),
      schedule({ id: 's2', name: 'Theirs', canManage: false }),
    ]);
    renderTab();
    await screen.findByText('Removed');
    const items = (menu: HTMLElement) =>
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent);

    expect(items(openMenu('Actions for Removed'))).toEqual(['View runs', 'Delete']);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
    expect(items(openMenu('Actions for Theirs'))).toEqual(['View runs', 'Open plugin']);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });

    fireEvent.click(screen.getByText('Removed'));
    const panel = await screen.findByRole('dialog', { name: 'Removed' });
    expect(within(panel).queryByRole('button', { name: 'Open plugin' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Resume' })).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('links the plugin, the last run and View runs, keeping the plugin and owner filters', async () => {
    service.listSchedules.mockResolvedValue([
      schedule({
        lastRun: {
          executionId: 'e1',
          status: 'FAILED',
          errorCode: 'DOC_LOCKED',
          finishedAt: '2026-10-17T06:00:05.000Z',
        },
      }),
    ]);
    renderTab({ isAdmin: true, url: '/?plugin=p1&owner=u1' });

    const row = await rowOf('Morning export');

    expect(within(row).getByRole('link', { name: 'Sheets Sync' })).toHaveAttribute(
      'href',
      '/ui/project-1/plugins/p1'
    );
    expect(within(row).getByRole('link', { name: /Failed/ })).toHaveAttribute(
      'href',
      '/?tab=runs&schedule=s1&run=e1&plugin=p1&owner=u1'
    );
    expect(
      within(openMenu('Actions for Morning export')).getByRole('menuitem', { name: 'View runs' })
    ).toHaveAttribute('href', '/?tab=runs&schedule=s1&plugin=p1&owner=u1');
  });

  it('filters by plugin and status in the URL, searches in place, and clears both', async () => {
    service.listSchedules.mockResolvedValue([
      schedule({ id: 's1', name: 'Morning export' }),
      schedule({
        id: 's2',
        name: 'Evening import',
        action: 'docs-sync',
        pluginId: 'p2',
        pluginName: 'Docs Sync',
        enabled: false,
        nextRunAt: null,
      }),
    ]);
    renderTab();
    await screen.findByText('Morning export');

    fireEvent.keyDown(screen.getByRole('button', { name: 'Plugin: All' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Docs Sync' }));
    await waitFor(() => {
      expect(rowNames()).toEqual(['Evening import']);
    });
    expect(currentSearch()).toBe('?plugin=p2');
    expect(screen.getByRole('button', { name: 'Plugin: Docs Sync' })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Status: All' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Active' }));
    expect(await screen.findByText('No schedules match these filters')).toBeInTheDocument();
    expect(currentSearch()).toBe('?plugin=p2&status=active');

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => {
      expect(rowNames()).toHaveLength(2);
    });
    expect(currentSearch()).toBe('');

    fireEvent.change(screen.getByRole('textbox', { name: 'Search schedules' }), {
      target: { value: 'DOCS-SYNC' },
    });
    expect(rowNames()).toEqual(['Evening import']);
  });

  it('shows the empty state with a way to the plugins', async () => {
    service.listSchedules.mockResolvedValue([]);

    renderTab();

    expect(await screen.findByText('No schedules yet')).toBeInTheDocument();
    expect(screen.getByText('A plugin creates schedules from its own page.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse plugins' })).toHaveAttribute(
      'href',
      '/ui/project-1/plugins'
    );
  });

  it('says when the schedules could not be loaded and reads them again on Try again', async () => {
    service.listSchedules
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([schedule()]);

    renderTab();

    expect(await screen.findByRole('alert')).toHaveTextContent('Schedules could not be loaded.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Morning export')).toBeInTheDocument();
  });
});
