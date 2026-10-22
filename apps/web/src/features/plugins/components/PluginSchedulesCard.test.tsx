import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginScheduleSummary } from '../types';

let projectId = 'project-1';
vi.mock('../../../shared/hooks', async importOriginal => ({
  ...(await importOriginal<object>()),
  useProjectId: () => projectId,
  useProjectRoute: () => ({ scope: (path: string) => `/ui/${projectId}${path}` }),
}));
vi.mock('../services/plugins.service', () => ({
  pluginsService: { listSchedules: vi.fn() },
}));

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

  const hintOf = async (trigger: HTMLElement) => {
    fireEvent.focus(trigger.closest('[data-slot="tooltip-trigger"]')!);
    return screen.findByRole('tooltip');
  };

  it('says there are no schedules for a plugin with a backend', async () => {
    renderCard();

    expect(await screen.findByText('This plugin has no schedules.')).toBeInTheDocument();
    expect(screen.getByText('Schedules')).toBeInTheDocument();
    expect(service.listSchedules).toHaveBeenCalledWith('i1');
  });

  it('links Manage schedules to Plugins → Schedules, filtered to this plugin', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);

    renderCard();

    expect(await screen.findByRole('link', { name: 'Manage schedules' })).toHaveAttribute(
      'href',
      '/ui/project-1/plugins/schedules?plugin=p1'
    );
  });

  it('links each schedule to its panel under Plugins → Schedules, with no actions here', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);

    renderCard();

    expect(await screen.findByRole('link', { name: 'Morning export' })).toHaveAttribute(
      'href',
      '/ui/project-1/plugins/schedules?plugin=p1&schedule=s1'
    );
    expect(screen.queryByRole('button', { name: /Pause|Resume|Delete/ })).toBeNull();
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

  it('describes a schedule in words, not by its cron or action', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);

    renderCard();

    expect(await screen.findByText('Daily at 09:00')).toBeInTheDocument();
    expect(screen.queryByText('0 9 * * *')).toBeNull();
    expect(screen.queryByText('export')).toBeNull();
  });

  it('shows a cron the summary cannot describe as it is', async () => {
    service.listSchedules.mockResolvedValue([schedule({ cron: '0 9 * * 1-5' })]);

    renderCard();

    expect(await screen.findByText('0 9 * * 1-5')).toBeInTheDocument();
  });

  it('names an unnamed schedule by its action', async () => {
    service.listSchedules.mockResolvedValue([schedule({ name: null })]);

    renderCard();

    expect(await screen.findByRole('link', { name: 'export' })).toBeInTheDocument();
  });

  it('lists the schedules in a table with Name, Schedule, Next run and Last run', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);

    renderCard();

    await screen.findByText('Morning export');
    expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual([
      'Name',
      'Schedule',
      'Next run',
      'Last run',
    ]);
  });

  const cellOf = async (column: number) => {
    await screen.findByText('Morning export');
    const cells = screen.getAllByRole('row')[1].querySelectorAll<HTMLElement>('td');
    return cells[column].querySelector<HTMLElement>('[data-slot="tooltip-trigger"]')!;
  };

  it("names the schedule's time zone on hover", async () => {
    service.listSchedules.mockResolvedValue([schedule()]);

    renderCard();

    expect(await hintOf(await cellOf(1))).toHaveTextContent('Europe/Kyiv');
  });

  it("shows when a schedule runs next, with the time in the schedule's own zone", async () => {
    service.listSchedules.mockResolvedValue([schedule()]);

    renderCard();

    // 06:00 UTC is 09:00 in Kyiv (UTC+3), whatever zone the browser is in.
    expect(await hintOf(await cellOf(2))).toHaveTextContent(
      'Next run: Oct 17, 2026, 09:00 AM GMT+3'
    );
  });

  it('marks a paused schedule, and a schedule paused by an admin with the reason', async () => {
    service.listSchedules.mockResolvedValue([
      schedule({ id: 's1', name: 'A', enabled: false, nextRunAt: null }),
      schedule({
        id: 's2',
        name: 'B',
        enabled: false,
        nextRunAt: null,
        disabledReason: 'PAUSED_BY_ADMIN',
      }),
    ]);

    renderCard();

    const [own, byAdmin] = await screen.findAllByText('Paused');
    expect(own.closest('[data-slot="tooltip-trigger"]')).toBeNull();
    expect(await hintOf(byAdmin)).toHaveTextContent('A project admin paused this schedule');
    expect(screen.queryByText('Disabled')).toBeNull();
  });

  it('marks a disabled schedule with the reason', async () => {
    service.listSchedules.mockResolvedValue([
      schedule({ enabled: false, nextRunAt: null, disabledReason: 'INVALID_PARAMETERS' }),
    ]);

    renderCard();

    expect(await hintOf(await screen.findByText('Disabled'))).toHaveTextContent(
      'Its settings no longer match the action'
    );
  });

  it("shows the last run's status, with its code and time in the schedule's zone on hover", async () => {
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

    expect(await hintOf(await screen.findByText('Failed'))).toHaveTextContent(
      'Last run: Failed (DOCUMENT_LOCKED) · Oct 16, 2026, 09:00 AM GMT+3'
    );
  });

  it('says a schedule has not run yet', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);

    renderCard();

    expect(await screen.findByText('Not run yet')).toBeInTheDocument();
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
    renderCard();

    await screen.findByText('Morning export');
    await act(async () => {
      await client.invalidateQueries();
    });

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

  describe('for an uninstalled plugin', () => {
    it('says the schedules return with the plugin', async () => {
      service.listSchedules.mockResolvedValue([schedule()]);

      renderCard(true, true);

      expect(await screen.findByText('Morning export')).toBeInTheDocument();
      expect(
        screen.getByText('These schedules run again if the plugin is restored.')
      ).toBeInTheDocument();
    });

    it('shows nothing when it has no schedules', async () => {
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
