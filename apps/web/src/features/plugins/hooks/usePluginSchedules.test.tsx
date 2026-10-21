import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/hooks', () => ({ useProjectId: () => 'project-1' }));
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
import type { ProjectPluginSchedule } from '../types';
import { SCHEDULES_KEY, usePluginSchedules } from './usePluginSchedules';

const service = vi.mocked(pluginsService);

const schedule = (over: Partial<ProjectPluginSchedule> = {}): ProjectPluginSchedule => ({
  id: 's1',
  name: null,
  action: 'export',
  cron: '0 9 * * *',
  timeZone: 'UTC',
  enabled: true,
  disabledReason: null,
  nextRunAt: null,
  lastRun: null,
  createdAt: '2026-10-16T10:00:00.000Z',
  modifiedAt: '2026-10-16T10:00:00.000Z',
  pluginId: 'p1',
  pluginName: 'Sheets Sync',
  installationId: 'i1',
  installationState: 'installed',
  owner: null,
  ownerIsMember: true,
  canManage: true,
  ...over,
});

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('usePluginSchedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    service.listSchedules.mockResolvedValue([schedule()]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('toasts a refused pause, reads the list again and answers false', async () => {
    service.pauseSchedule.mockRejectedValue({
      response: { data: { code: 'SCHEDULE_BUSY', message: 'The schedule is running' } },
    });
    const { result } = renderHook(() => usePluginSchedules('i1'), { wrapper });
    await waitFor(() => {
      expect(result.current.schedules).toHaveLength(1);
    });

    let changed = true;
    await act(async () => {
      changed = await result.current.change('pause', 's1');
    });

    expect(changed).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('The schedule is running');
    await waitFor(() => {
      expect(service.listSchedules).toHaveBeenCalledTimes(2);
    });
  });

  it('invalidates every schedule list of the project after a delete', async () => {
    service.deleteSchedule.mockResolvedValue(undefined);
    client.setQueryData([SCHEDULES_KEY, 'project-1', 'all'], [schedule({ id: 's2' })]);
    client.setQueryData([SCHEDULES_KEY, 'project-2', 'all'], [schedule({ id: 's3' })]);
    const { result } = renderHook(() => usePluginSchedules('i1'), { wrapper });
    await waitFor(() => {
      expect(result.current.schedules).toHaveLength(1);
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    let changed = false;
    await act(async () => {
      changed = await result.current.change('delete', 's1');
    });

    expect(changed).toBe(true);
    expect(service.deleteSchedule).toHaveBeenCalledWith('s1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [SCHEDULES_KEY, 'project-1'] });
    expect(client.getQueryState([SCHEDULES_KEY, 'project-1', 'all'])?.isInvalidated).toBe(true);
    expect(client.getQueryState([SCHEDULES_KEY, 'project-2', 'all'])?.isInvalidated).toBe(false);
  });

  it('reads every schedule the caller can see when no installation is named', async () => {
    const { result } = renderHook(() => usePluginSchedules(), { wrapper });
    await waitFor(() => {
      expect(result.current.schedules).toHaveLength(1);
    });

    expect(service.listSchedules).toHaveBeenCalledWith(undefined);
    expect(client.getQueryData([SCHEDULES_KEY, 'project-1', 'all'])).toEqual([schedule()]);
  });

  it('keeps the same change function across renders', async () => {
    const { result, rerender } = renderHook(() => usePluginSchedules('i1'), { wrapper });
    await waitFor(() => {
      expect(result.current.schedules).toHaveLength(1);
    });
    const first = result.current.change;

    rerender();

    expect(result.current.change).toBe(first);
  });

  it.each(['QUEUED', 'RUNNING'] as const)('polls every 15 s while a run is %s', async status => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    service.listSchedules.mockResolvedValue([
      schedule({ lastRun: { executionId: 'e1', status, errorCode: null, finishedAt: null } }),
    ]);
    const { result } = renderHook(() => usePluginSchedules('i1'), { wrapper });
    await waitFor(() => {
      expect(result.current.schedules).toHaveLength(1);
    });
    expect(service.listSchedules).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(service.listSchedules).toHaveBeenCalledTimes(2);
  });

  it('does not poll once no run is queued or running', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    service.listSchedules.mockResolvedValue([
      schedule({
        lastRun: { executionId: 'e1', status: 'SUCCEEDED', errorCode: null, finishedAt: null },
      }),
    ]);
    const { result } = renderHook(() => usePluginSchedules('i1'), { wrapper });
    await waitFor(() => {
      expect(result.current.schedules).toHaveLength(1);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(service.listSchedules).toHaveBeenCalledTimes(1);
  });
});
