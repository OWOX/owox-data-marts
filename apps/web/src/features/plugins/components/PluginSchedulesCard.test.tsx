import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginScheduleSummary } from '../types';

let projectId = 'project-1';
vi.mock('../../../shared/hooks', () => ({
  useProjectId: () => projectId,
  useProjectRoute: () => ({ scope: (path: string) => `/ui/${projectId}${path}` }),
}));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { default: toast };
});
vi.mock('../services/plugins.service', () => ({
  pluginsService: {
    listSchedules: vi.fn(),
    pauseSchedule: vi.fn(),
    resumeSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
  },
}));

import toast from 'react-hot-toast';
import { pluginsService } from '../services/plugins.service';
import { PluginSchedulesCard } from './PluginSchedulesCard';

const service = pluginsService as unknown as Record<string, ReturnType<typeof vi.fn>>;

const schedule = (over: Partial<PluginScheduleSummary> = {}): PluginScheduleSummary => ({
  id: 's1',
  name: 'Morning export',
  action: 'export',
  cron: '0 9 * * *',
  timeZone: 'Europe/Kyiv',
  enabled: true,
  disabledReason: null,
  nextRunAt: '2026-10-17T06:00:00.000Z',
  lastRun: null,
  createdAt: '2026-10-16T10:00:00.000Z',
  modifiedAt: '2026-10-16T10:00:00.000Z',
  ...over,
});

let client: QueryClient;
const renderCard = (hasBackend = true, uninstalled = false) =>
  render(
    <QueryClientProvider
      client={(client = new QueryClient({ defaultOptions: { queries: { retry: false } } }))}
    >
      <MemoryRouter>
        <PluginSchedulesCard
          pluginId='p1'
          installationId='i1'
          hasBackend={hasBackend}
          uninstalled={uninstalled}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('PluginSchedulesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectId = 'project-1';
    service.listSchedules.mockResolvedValue([]);
  });

  it('says there are no schedules for a plugin with a backend', async () => {
    renderCard();

    expect(await screen.findByText('This plugin has no schedules.')).toBeInTheDocument();
    expect(screen.getByText('Schedules')).toBeInTheDocument();
    expect(service.listSchedules).toHaveBeenCalledWith('i1');
  });

  it('links View all to Plugins → Schedules, filtered to this plugin', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);

    renderCard();

    expect(await screen.findByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/ui/project-1/plugins/schedules?plugin=p1'
    );
  });

  it('shows nothing for a plugin without a backend and without schedules', async () => {
    renderCard(false);

    await waitFor(() => {
      expect(service.listSchedules).toHaveBeenCalled();
    });
    expect(screen.queryByText('Schedules')).toBeNull();
  });

  it('shows the card for a plugin without a backend once it has schedules', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);

    renderCard(false);

    expect(await screen.findByText('Morning export')).toBeInTheDocument();
    expect(screen.getByText('Schedules')).toBeInTheDocument();
  });

  it('says when the schedules could not be loaded', async () => {
    service.listSchedules.mockRejectedValue(new Error('offline'));

    renderCard();

    expect(await screen.findByText('Could not load schedules.')).toBeInTheDocument();
  });

  it('lists an active schedule with its action, cron, zone, next run and last run', async () => {
    service.listSchedules.mockResolvedValue([
      schedule({
        lastRun: {
          executionId: 'e1',
          status: 'SUCCEEDED',
          errorCode: null,
          finishedAt: '2026-10-16T06:00:05.000Z',
        },
      }),
    ]);

    renderCard();

    expect(await screen.findByText('Morning export')).toBeInTheDocument();
    expect(screen.getByText('export')).toBeInTheDocument();
    expect(screen.getByText('0 9 * * *')).toBeInTheDocument();
    expect(screen.getByText('Europe/Kyiv')).toBeInTheDocument();
    expect(screen.getByText(/Next run/)).toBeInTheDocument();
    expect(screen.getByText(/Last run: Succeeded/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause Morning export' })).toBeInTheDocument();
    expect(screen.queryByText('Paused')).toBeNull();
  });

  it('names an unnamed schedule by its action, once', async () => {
    service.listSchedules.mockResolvedValue([schedule({ name: null })]);

    renderCard();

    expect(await screen.findAllByText('export')).toHaveLength(1);
  });

  it("names each row's buttons after its schedule", async () => {
    service.listSchedules.mockResolvedValue([
      schedule(),
      schedule({ id: 's2', name: null, enabled: false, nextRunAt: null }),
    ]);

    renderCard();

    expect(await screen.findByRole('button', { name: 'Pause Morning export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Morning export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete export' })).toBeInTheDocument();
  });

  it('shows a paused schedule with a Paused badge and a Resume button', async () => {
    service.listSchedules.mockResolvedValue([schedule({ enabled: false, nextRunAt: null })]);

    renderCard();

    expect(await screen.findByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume Morning export' })).toBeInTheDocument();
    expect(screen.queryByText(/Next run/)).toBeNull();
  });

  it.each([
    ['ACTION_NOT_DECLARED', 'The plugin no longer has this action'],
    ['INVALID_PARAMETERS', 'Its settings no longer match the action'],
  ] as const)('shows a schedule disabled by %s with its reason', async (reason, text) => {
    service.listSchedules.mockResolvedValue([
      schedule({ enabled: false, nextRunAt: null, disabledReason: reason }),
    ]);

    renderCard();

    expect(await screen.findByText('Disabled')).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText('Paused')).toBeNull();
    expect(screen.getByRole('button', { name: 'Resume Morning export' })).toBeInTheDocument();
  });

  it('shows a schedule paused by an admin as Paused with its reason', async () => {
    service.listSchedules.mockResolvedValue([
      schedule({ enabled: false, nextRunAt: null, disabledReason: 'PAUSED_BY_ADMIN' }),
    ]);

    renderCard();

    expect(await screen.findByText('Paused')).toBeInTheDocument();
    expect(screen.getByText('A project admin paused this schedule')).toBeInTheDocument();
    expect(screen.queryByText('Disabled')).toBeNull();
  });

  it('shows a queued last run', async () => {
    service.listSchedules.mockResolvedValue([
      schedule({
        lastRun: { executionId: 'e1', status: 'QUEUED', errorCode: null, finishedAt: null },
      }),
    ]);

    renderCard();

    expect(await screen.findByText('Last run: Queued')).toBeInTheDocument();
  });

  it('shows the code of a failed last run', async () => {
    service.listSchedules.mockResolvedValue([
      schedule({
        lastRun: {
          executionId: 'e1',
          status: 'FAILED',
          errorCode: 'DOCUMENT_LOCKED',
          finishedAt: '2026-10-16T06:00:05.000Z',
        },
      }),
    ]);

    renderCard();

    expect(await screen.findByText(/Last run: Failed \(DOCUMENT_LOCKED\)/)).toBeInTheDocument();
  });

  it('pauses a schedule and shows it paused after the refresh', async () => {
    service.listSchedules
      .mockResolvedValueOnce([schedule()])
      .mockResolvedValueOnce([schedule({ enabled: false, nextRunAt: null })]);
    service.pauseSchedule.mockResolvedValue(schedule({ enabled: false, nextRunAt: null }));
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Pause Morning export' }));

    await waitFor(() => {
      expect(service.pauseSchedule).toHaveBeenCalledWith('s1');
    });
    expect(await screen.findByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume Morning export' })).toBeInTheDocument();
  });

  it('resumes a paused schedule and shows it active after the refresh', async () => {
    service.listSchedules
      .mockResolvedValueOnce([schedule({ enabled: false, nextRunAt: null })])
      .mockResolvedValueOnce([schedule()]);
    service.resumeSchedule.mockResolvedValue(schedule());
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Resume Morning export' }));

    await waitFor(() => {
      expect(service.resumeSchedule).toHaveBeenCalledWith('s1');
    });
    expect(await screen.findByRole('button', { name: 'Pause Morning export' })).toBeInTheDocument();
    expect(screen.queryByText('Paused')).toBeNull();
  });

  it('shows the refusal message of a refused resume and leaves the schedule disabled', async () => {
    const disabled = schedule({
      enabled: false,
      nextRunAt: null,
      disabledReason: 'INVALID_PARAMETERS',
    });
    service.listSchedules.mockResolvedValue([disabled]);
    service.resumeSchedule.mockRejectedValue({
      response: {
        data: { code: 'INVALID_PARAMETERS', message: 'Parameters do not match the action schema' },
      },
    });
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Resume Morning export' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Parameters do not match the action schema');
    });
    expect(await screen.findByText('Disabled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume Morning export' })).toBeInTheDocument();
  });

  it('asks before deleting, and does nothing when the member cancels', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Morning export' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this schedule?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(service.deleteSchedule).not.toHaveBeenCalled();
    expect(screen.getByText('Morning export')).toBeInTheDocument();
  });

  it('deletes a schedule after confirmation and drops its row', async () => {
    service.listSchedules.mockResolvedValueOnce([schedule()]).mockResolvedValueOnce([]);
    service.deleteSchedule.mockResolvedValue(undefined);
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Morning export' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this schedule?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(service.deleteSchedule).toHaveBeenCalledWith('s1');
    });
    expect(await screen.findByText('This plugin has no schedules.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the dialog open and reports a refused delete', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);
    service.deleteSchedule.mockRejectedValue({
      response: { data: { code: 'SCHEDULE_BUSY', message: 'The schedule is running' } },
    });
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Morning export' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this schedule?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('The schedule is running');
    });
    expect(screen.getByRole('dialog', { name: 'Delete this schedule?' })).toBeInTheDocument();
  });

  it("shows the next and last run in the schedule's own zone, named", async () => {
    service.listSchedules.mockResolvedValue([
      schedule({
        lastRun: {
          executionId: 'e1',
          status: 'SUCCEEDED',
          errorCode: null,
          finishedAt: '2026-10-16T06:00:05.000Z',
        },
      }),
    ]);

    renderCard();

    // 06:00 UTC is 09:00 in Kyiv (UTC+3), whatever zone the browser is in.
    expect(await screen.findByText('Next run Oct 17, 2026, 09:00 AM GMT+3')).toBeInTheDocument();
    expect(
      screen.getByText('Last run: Succeeded · Oct 16, 2026, 09:00 AM GMT+3')
    ).toBeInTheDocument();
  });

  it('closes the delete dialog once the schedule is gone, when the delete found it missing', async () => {
    service.listSchedules.mockResolvedValueOnce([schedule()]).mockResolvedValue([]);
    service.deleteSchedule.mockRejectedValue({
      response: { data: { code: 'SCHEDULE_NOT_FOUND', message: 'The schedule does not exist' } },
    });
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Morning export' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this schedule?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('The schedule does not exist');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await screen.findByText('This plugin has no schedules.')).toBeInTheDocument();
  });

  it('announces a failed load as an alert and reads the list again on Retry', async () => {
    service.listSchedules
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([schedule()]);
    renderCard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load schedules.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Morning export')).toBeInTheDocument();
    expect(service.listSchedules).toHaveBeenCalledTimes(2);
  });

  it('announces loading as a status', () => {
    service.listSchedules.mockReturnValue(new Promise(() => undefined));
    renderCard();

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('renders nothing before there is a project to read schedules from', () => {
    projectId = '';
    const { container } = renderCard();

    expect(container).toBeEmptyDOMElement();
    expect(service.listSchedules).not.toHaveBeenCalled();
  });

  it('keeps the loaded list beside the alert when a later refresh fails', async () => {
    service.listSchedules
      .mockResolvedValueOnce([schedule()])
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([schedule()]);
    service.pauseSchedule.mockResolvedValue(schedule({ enabled: false }));
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Pause Morning export' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load schedules.');
    expect(screen.getByText('Morning export')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('shows the load error of an uninstalled plugin whose schedules are unknown', async () => {
    service.listSchedules.mockRejectedValue(new Error('offline'));

    renderCard(true, true);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('asks about the current row of the schedule, not the one clicked', async () => {
    service.listSchedules
      .mockResolvedValueOnce([schedule()])
      .mockResolvedValue([schedule({ name: 'Renamed export' })]);
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Morning export' }));
    await act(async () => {
      await client.invalidateQueries();
    });

    expect(
      await within(screen.getByRole('dialog')).findByText('Renamed export')
    ).toBeInTheDocument();
  });

  describe('for an uninstalled plugin', () => {
    it('offers Delete only and says the schedules return with the plugin', async () => {
      service.listSchedules.mockResolvedValue([schedule()]);

      renderCard(true, true);

      expect(await screen.findByText('Morning export')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete Morning export' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^(Pause|Resume)/ })).toBeNull();
      expect(
        screen.getByText('These schedules run again if the plugin is restored.')
      ).toBeInTheDocument();
    });

    it('shows nothing when there are no schedules to delete', async () => {
      renderCard(true, true);

      await waitFor(() => {
        expect(service.listSchedules).toHaveBeenCalled();
      });
      expect(screen.queryByText('Schedules')).toBeNull();
    });

    it('says nothing about restoring for an installed plugin', async () => {
      service.listSchedules.mockResolvedValue([schedule()]);

      renderCard();

      await screen.findByText('Morning export');
      expect(screen.queryByText(/restored/)).toBeNull();
    });
  });
});
