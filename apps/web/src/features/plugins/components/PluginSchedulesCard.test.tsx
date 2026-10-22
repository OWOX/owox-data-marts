import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginScheduleSummary } from '../types';

let projectId = 'project-1';
vi.mock('../../../shared/hooks', async importOriginal => ({
  ...(await importOriginal<object>()),
  useProjectId: () => projectId,
  useProjectRoute: () => ({ scope: (path: string) => `/ui/${projectId}${path}` }),
}));
const user = { id: 'u1' };
vi.mock('../../idp/hooks/useAuthState', () => ({ useUser: () => user }));
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

let location = '';
function Location() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    location = pathname + search;
  });
  return null;
}

let client: QueryClient;
const renderCard = (hasBackend = true, uninstalled = false, pluginId = 'p1') =>
  render(
    <QueryClientProvider
      client={(client = new QueryClient({ defaultOptions: { queries: { retry: false } } }))}
    >
      <MemoryRouter>
        <PluginSchedulesCard
          pluginId={pluginId}
          installationId='i1'
          hasBackend={hasBackend}
          uninstalled={uninstalled}
        />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>
  );

const namesInOrder = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map(row => row.querySelector('a')?.textContent);

describe('PluginSchedulesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    projectId = 'project-1';
    service.listSchedules.mockResolvedValue([]);
  });

  const hintOf = async (trigger: HTMLElement) => {
    fireEvent.focus(trigger.closest('[data-slot="tooltip-trigger"]')!);
    return screen.findByRole('tooltip');
  };

  it('says there are no schedules for a plugin with a backend, and links to how a plugin adds one', async () => {
    renderCard();

    expect(await screen.findByText(/^This plugin has no schedules\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Run actions on a schedule' })).toHaveAttribute(
      'href',
      expect.stringMatching(
        /^https:\/\/docs\.owox\.com\/docs\/plugins\/authoring-guide\/\?.*#run-actions-on-a-schedule$/
      )
    );
    expect(screen.getByText('Schedules')).toBeInTheDocument();
    expect(service.listSchedules).toHaveBeenCalledWith('i1');
  });

  const ranAt = (day: number) => ({
    executionId: `e${String(day)}`,
    status: 'SUCCEEDED',
    errorCode: null,
    finishedAt: `2026-10-${String(day).padStart(2, '0')}T06:00:00.000Z`,
  });

  it("shows the ten schedules that ran last and links to all of the member's own", async () => {
    service.listSchedules.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) =>
        schedule({
          id: `s${String(index)}`,
          name: `Schedule ${String(index)}`,
          lastRun: ranAt(index + 1),
        })
      )
    );

    renderCard();

    expect(await screen.findByText('Schedule 11')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(screen.getByText('Schedule 2')).toBeInTheDocument();
    expect(screen.queryByText('Schedule 1')).toBeNull();
    expect(screen.queryByText('Schedule 0')).toBeNull();
    // An admin's full list holds every member's schedules, so the link keeps it to the card's.
    expect(screen.getByRole('link', { name: 'View all 12 schedules' })).toHaveAttribute(
      'href',
      '/ui/project-1/plugins/schedules?plugin=p1&owner=u1'
    );
  });

  it('keeps the ten that ran last when a column sorts them', async () => {
    service.listSchedules.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) =>
        schedule({
          id: `s${String(index)}`,
          name: `Schedule ${String(index)}`,
          lastRun: ranAt(index + 1),
        })
      )
    );

    renderCard();
    await screen.findByText('Schedule 11');
    fireEvent.click(screen.getByRole('button', { name: /^Name - / }));

    expect(namesInOrder()).toEqual([
      'Schedule 10',
      'Schedule 11',
      ...[2, 3, 4, 5, 6, 7, 8, 9].map(index => `Schedule ${String(index)}`),
    ]);
  });

  it('links to all the schedules from the eleventh on', async () => {
    service.listSchedules.mockResolvedValue(
      Array.from({ length: 11 }, (_, index) =>
        schedule({ id: `s${String(index)}`, name: `Schedule ${String(index)}` })
      )
    );

    renderCard();

    expect(await screen.findByRole('link', { name: 'View all 11 schedules' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(11);
  });

  it('lists the schedules that ran last first, and those not run yet last', async () => {
    service.listSchedules.mockResolvedValue([
      schedule({ id: 's1', name: 'Never' }),
      schedule({ id: 's2', name: 'Earlier', lastRun: ranAt(14) }),
      schedule({ id: 's3', name: 'Latest', lastRun: ranAt(16) }),
    ]);

    renderCard();

    await screen.findByText('Latest');
    expect(namesInOrder()).toEqual(['Latest', 'Earlier', 'Never']);
  });

  it('lists a schedule whose run is still going first, by its status alone', async () => {
    service.listSchedules.mockResolvedValue([
      schedule({ id: 's1', name: 'Latest', lastRun: ranAt(16) }),
      schedule({ id: 's2', name: 'Never' }),
      schedule({
        id: 's3',
        name: 'Going',
        lastRun: { executionId: 'e3', status: 'RUNNING', errorCode: null, finishedAt: null },
      }),
    ]);

    renderCard();

    await screen.findByText('Going');
    expect(namesInOrder()).toEqual(['Going', 'Latest', 'Never']);
    expect(screen.getByText('Running').closest('td')).toHaveTextContent(/^Running$/);
  });

  it.each([1, 10])('has no link to all the schedules when the card shows all %i', async count => {
    service.listSchedules.mockResolvedValue(
      Array.from({ length: count }, (_, index) =>
        schedule({ id: `s${String(index)}`, name: `Schedule ${String(index)}` })
      )
    );

    renderCard();

    await screen.findByText('Schedule 0');
    expect(screen.getAllByRole('row')).toHaveLength(count + 1);
    expect(screen.queryByRole('link', { name: /View all/ })).toBeNull();
  });

  it('sorts the schedules by how they read, not by their cron', async () => {
    service.listSchedules.mockResolvedValue([
      schedule({ id: 's1', name: 'Quarter', cron: '*/15 * * * *' }),
      schedule({ id: 's2', name: 'Nine', cron: '0 9 * * *' }),
      schedule({ id: 's3', name: 'Half past eight', cron: '30 8 * * *' }),
    ]);

    renderCard();

    await screen.findByText('Quarter');
    fireEvent.click(screen.getByRole('button', { name: /^Schedule - / }));
    expect(namesInOrder()).toEqual(['Half past eight', 'Nine', 'Quarter']);
  });

  it("keeps each plugin's sorting to its own card", async () => {
    service.listSchedules.mockResolvedValue([
      schedule({ id: 's1', name: 'Zed', lastRun: ranAt(16) }),
      schedule({ id: 's2', name: 'Abe', lastRun: ranAt(14) }),
    ]);
    const { unmount } = renderCard();
    await screen.findByText('Zed');
    fireEvent.click(screen.getByRole('button', { name: /^Name - / }));
    expect(namesInOrder()).toEqual(['Abe', 'Zed']);
    unmount();

    renderCard(true, false, 'p2');

    await screen.findByText('Zed');
    expect(namesInOrder()).toEqual(['Zed', 'Abe']);
  });

  it('opens the schedule from anywhere in its row', async () => {
    service.listSchedules.mockResolvedValue([schedule()]);

    renderCard();

    fireEvent.click(await screen.findByText('Daily at 09:00'));
    expect(location).toBe('/ui/project-1/plugins/schedules?plugin=p1&schedule=s1');
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
    const nextRun = await cellOf(2);
    expect(await hintOf(nextRun)).toHaveTextContent('Next run: Oct 17, 2026, 09:00 AM GMT+3');
    // No second hint in the browser's own zone.
    expect(nextRun.querySelector('[title]')).toBeNull();
  });

  it("reads the next and last run in the schedule's zone, not the browser's", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
    try {
      service.listSchedules.mockResolvedValue([
        schedule({
          timeZone: 'Asia/Tokyo',
          // Monday 09:00 and Tuesday 18:30 in Tokyo, UTC+9.
          nextRunAt: '2026-10-19T00:00:00.000Z',
          lastRun: { ...ranAt(13), finishedAt: '2026-10-13T09:30:00.000Z' },
        }),
      ]);

      renderCard();

      expect(await screen.findByText('This Monday at 9:00 AM')).toBeInTheDocument();
      expect(screen.getByText('Last Tuesday at 6:30 PM')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a dash for an enabled schedule with no next run', async () => {
    service.listSchedules.mockResolvedValue([schedule({ nextRunAt: null })]);

    renderCard();

    await screen.findByText('Morning export');
    expect(screen.getAllByRole('row')[1].querySelectorAll('td')[2]).toHaveTextContent(/^—$/);
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

    const pausedIn = (name: string) =>
      within(screen.getByRole('link', { name }).closest('tr')!).getByText('Paused');
    await screen.findByText('A');
    expect(pausedIn('A').closest('[data-slot="tooltip-trigger"]')).toBeNull();
    expect(await hintOf(pausedIn('B'))).toHaveTextContent('A project admin paused this schedule');
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

  it('keeps the alert beside an empty list when a later refresh fails', async () => {
    service.listSchedules.mockResolvedValueOnce([]).mockRejectedValue(new Error('offline'));
    renderCard();

    await screen.findByText(/^This plugin has no schedules\./);
    await act(async () => {
      await client.invalidateQueries();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load schedules.');
    expect(screen.getByText(/^This plugin has no schedules\./)).toBeInTheDocument();
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
