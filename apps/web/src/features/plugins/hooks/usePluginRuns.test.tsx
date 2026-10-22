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
  pluginsService: { listRuns: vi.fn(), getRun: vi.fn(), cancelRun: vi.fn() },
}));

import toast from 'react-hot-toast';
import { pluginsService } from '../services/plugins.service';
import type { PluginRun, PluginRunFilters } from '../types';
import { SCHEDULES_KEY } from './usePluginSchedules';
import { RUNS_KEY, useCancelPluginRun, usePluginRun, usePluginRuns } from './usePluginRuns';

const service = vi.mocked(pluginsService);
const ANY: PluginRunFilters = { statuses: [] };

const run = (over: Partial<PluginRun> = {}): PluginRun => ({
  id: 'r1',
  pluginId: 'p1',
  pluginName: 'Sheets Sync',
  pluginVersion: '1.2.0',
  action: 'sync',
  status: 'SUCCEEDED',
  trigger: 'frontend',
  scheduleId: null,
  scheduleName: null,
  owner: null,
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

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('usePluginRuns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the next page with its cursor and lists the pages in order', async () => {
    const filters: PluginRunFilters = { statuses: ['FAILED'] };
    service.listRuns
      .mockResolvedValueOnce({ items: [run()], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [run({ id: 'r2' })], nextCursor: null });
    const { result } = renderHook(() => usePluginRuns(filters), { wrapper });
    await waitFor(() => {
      expect(result.current.hasMore).toBe(true);
    });

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.runs.map(item => item.id)).toEqual(['r1', 'r2']);
    });
    expect(service.listRuns).toHaveBeenNthCalledWith(1, filters, undefined);
    expect(service.listRuns).toHaveBeenNthCalledWith(2, filters, 'c1');
    expect(result.current.hasMore).toBe(false);
  });

  it('refetches every 5 s while a loaded run is open, and stops once none is', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    service.listRuns
      .mockResolvedValueOnce({ items: [run({ status: 'QUEUED' })], nextCursor: null })
      .mockResolvedValue({ items: [run()], nextCursor: null });
    const { result } = renderHook(() => usePluginRuns(ANY), { wrapper });
    await waitFor(() => {
      expect(result.current.runs).toHaveLength(1);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(service.listRuns).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(service.listRuns).toHaveBeenCalledTimes(2);
  });

  it('reads a linked run once, and gives null only for one the API cannot find', async () => {
    service.getRun
      .mockResolvedValueOnce(run({ id: 'r9' }))
      .mockRejectedValueOnce({ response: { status: 404 } });
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => usePluginRun(id), {
      wrapper,
      initialProps: { id: null as string | null },
    });
    expect(result.current).toBeUndefined();
    expect(service.getRun).not.toHaveBeenCalled();

    rerender({ id: 'r9' });
    await waitFor(() => {
      expect(result.current?.id).toBe('r9');
    });

    rerender({ id: 'gone' });
    await waitFor(() => {
      expect(client.getQueryState([RUNS_KEY, 'project-1', 'run', 'gone'])?.status).toBe('error');
    });
    expect(result.current).toBeNull();
    expect(service.getRun).toHaveBeenCalledTimes(2);
  });

  it.each(['QUEUED', 'RUNNING'] as const)(
    'refetches a linked run every 5 s while it is %s, and stops once it is final',
    async status => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      service.getRun
        .mockResolvedValueOnce(run({ id: 'r9', status }))
        .mockResolvedValue(run({ id: 'r9' }));
      const { result } = renderHook(() => usePluginRun('r9'), { wrapper });
      await waitFor(() => {
        expect(result.current?.status).toBe(status);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(service.getRun).toHaveBeenCalledTimes(2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(service.getRun).toHaveBeenCalledTimes(2);
    }
  );

  it('stops polling a linked run once it answers 404, and drops the stale run', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    service.getRun
      .mockResolvedValueOnce(run({ id: 'r9', status: 'RUNNING' }))
      .mockRejectedValue({ response: { status: 404 } });
    const { result } = renderHook(() => usePluginRun('r9'), { wrapper });
    await waitFor(() => {
      expect(result.current?.status).toBe('RUNNING');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(service.getRun).toHaveBeenCalledTimes(2);
    expect(result.current).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(service.getRun).toHaveBeenCalledTimes(2);
  });

  it('cancels a run, reads runs and schedules again, and toasts a refusal', async () => {
    service.cancelRun.mockResolvedValueOnce(run({ status: 'CANCELLED' })).mockRejectedValueOnce({
      response: { data: { code: 'EXECUTION_NOT_FOUND', message: 'Execution was not found' } },
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCancelPluginRun(), { wrapper });

    let cancelled = false;
    await act(async () => {
      cancelled = await result.current.cancel('r1');
    });
    expect(cancelled).toBe(true);
    expect(service.cancelRun).toHaveBeenCalledWith('r1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [RUNS_KEY, 'project-1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [SCHEDULES_KEY, 'project-1'] });

    await act(async () => {
      cancelled = await result.current.cancel('r1');
    });
    expect(cancelled).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Execution was not found');
  });
});
