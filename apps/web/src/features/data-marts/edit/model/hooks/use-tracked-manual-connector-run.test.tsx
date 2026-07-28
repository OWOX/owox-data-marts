// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataMartRunStatus, DataMartRunTriggerType, DataMartRunType } from '../../../shared';
import type { DataMartRunItem } from '../types';
import { useTrackedManualConnectorRun } from './use-tracked-manual-connector-run';

describe('useTrackedManualConnectorRun', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: Infinity,
          retry: false,
        },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.useRealTimers();
  });

  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('fetches the exact terminal run when the tracked id is outside the current page', async () => {
    const terminalRun = createRun('manual-run-1', DataMartRunStatus.SUCCESS);
    const getDataMartRunById = vi.fn().mockResolvedValue(terminalRun);
    const { result } = renderHook(
      () =>
        useTrackedManualConnectorRun({
          dataMartId: 'dm-1',
          trackedRunId: terminalRun.id,
          runs: [createRun('older-run', DataMartRunStatus.FAILED)],
          getDataMartRunById,
        }),
      { wrapper }
    );

    await vi.waitFor(() => {
      expect(result.current.data).toBe(terminalRun);
    });
    expect(getDataMartRunById).toHaveBeenCalledWith('dm-1', terminalRun.id, { silent: true });
  });

  it('waits while the exact fetched run is active and keeps polling until terminal', async () => {
    vi.useFakeTimers();
    const runningRun = createRun('manual-run-1', DataMartRunStatus.RUNNING);
    const terminalRun = createRun('manual-run-1', DataMartRunStatus.SUCCESS);
    const getDataMartRunById = vi
      .fn()
      .mockResolvedValueOnce(runningRun)
      .mockResolvedValue(terminalRun);
    const { result } = renderHook(
      () =>
        useTrackedManualConnectorRun({
          dataMartId: 'dm-1',
          trackedRunId: runningRun.id,
          runs: [],
          getDataMartRunById,
        }),
      { wrapper }
    );

    await vi.waitFor(() => {
      expect(result.current.data?.status).toBe(DataMartRunStatus.RUNNING);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    await vi.waitFor(() => {
      expect(result.current.data?.status).toBe(DataMartRunStatus.SUCCESS);
    });
    expect(getDataMartRunById).toHaveBeenCalledTimes(2);
  });

  it('keeps polling after a silent fetch error so tracking can recover', async () => {
    vi.useFakeTimers();
    const terminalRun = createRun('manual-run-1', DataMartRunStatus.SUCCESS);
    const getDataMartRunById = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary fetch failure'))
      .mockResolvedValue(terminalRun);
    const { result } = renderHook(
      () =>
        useTrackedManualConnectorRun({
          dataMartId: 'dm-1',
          trackedRunId: terminalRun.id,
          runs: [],
          getDataMartRunById,
        }),
      { wrapper }
    );

    await vi.waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(getDataMartRunById).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    await vi.waitFor(() => {
      expect(result.current.data).toBe(terminalRun);
    });
    expect(getDataMartRunById).toHaveBeenCalledTimes(2);
    expect(getDataMartRunById).toHaveBeenNthCalledWith(1, 'dm-1', terminalRun.id, {
      silent: true,
    });
    expect(getDataMartRunById).toHaveBeenNthCalledWith(2, 'dm-1', terminalRun.id, {
      silent: true,
    });
  });

  it('recovers when a stale running item is retained in the merged local history', async () => {
    const trackedRun = createRun('manual-run-1', DataMartRunStatus.RUNNING);
    const terminalRun = createRun('manual-run-1', DataMartRunStatus.SUCCESS);
    const getDataMartRunById = vi.fn().mockResolvedValue(terminalRun);
    const { result } = renderHook(
      () =>
        useTrackedManualConnectorRun({
          dataMartId: 'dm-1',
          trackedRunId: trackedRun.id,
          runs: [trackedRun],
          getDataMartRunById,
        }),
      { wrapper }
    );

    await vi.waitFor(() => {
      expect(result.current.data).toBe(terminalRun);
    });
    expect(getDataMartRunById).toHaveBeenCalledWith('dm-1', trackedRun.id, { silent: true });
  });

  it('does not issue an exact request after the current history has the terminal run', () => {
    const getDataMartRunById = vi.fn();
    const trackedRun = createRun('manual-run-1', DataMartRunStatus.SUCCESS);
    const { result } = renderHook(
      () =>
        useTrackedManualConnectorRun({
          dataMartId: 'dm-1',
          trackedRunId: trackedRun.id,
          runs: [trackedRun],
          getDataMartRunById,
        }),
      { wrapper }
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(getDataMartRunById).not.toHaveBeenCalled();
  });
});

function createRun(id: string, status: DataMartRunStatus): DataMartRunItem {
  return {
    id,
    status,
    type: DataMartRunType.CONNECTOR,
    triggerType: DataMartRunTriggerType.MANUAL,
    createdAt: new Date('2026-07-16T12:00:00.000Z'),
  } as DataMartRunItem;
}
