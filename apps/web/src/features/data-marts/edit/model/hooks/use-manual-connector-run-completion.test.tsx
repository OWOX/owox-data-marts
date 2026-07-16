// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataMartRunStatus, DataMartRunTriggerType, DataMartRunType } from '../../../shared';
import type { DataMartRunItem } from '../types';
import { useManualConnectorRunCompletion } from './use-manual-connector-run-completion';

describe('useManualConnectorRunCompletion', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.useRealTimers();
  });

  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('clears tracking when the missing paginated id resolves to an exact terminal run', async () => {
    const terminalRun = createRun(DataMartRunStatus.SUCCESS);
    const resetManualRunTriggered = vi.fn();
    const onCompleted = vi.fn();

    renderHook(
      () =>
        useManualConnectorRunCompletion({
          enabled: true,
          dataMartId: 'dm-1',
          trackedRunId: terminalRun.id,
          runs: [],
          getDataMartRunById: vi.fn().mockResolvedValue(terminalRun),
          resetManualRunTriggered,
          onCompleted,
        }),
      { wrapper }
    );

    await vi.waitFor(() => {
      expect(resetManualRunTriggered).toHaveBeenCalledTimes(1);
    });
    expect(resetManualRunTriggered).toHaveBeenCalledWith(terminalRun);
    expect(onCompleted).toHaveBeenCalledWith(terminalRun);
  });

  it('preserves tracking after a fetch error and clears it only after a later terminal result', async () => {
    vi.useFakeTimers();
    const terminalRun = createRun(DataMartRunStatus.SUCCESS);
    const getDataMartRunById = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary fetch failure'))
      .mockResolvedValue(terminalRun);
    const resetManualRunTriggered = vi.fn();
    const onCompleted = vi.fn();

    renderHook(
      () =>
        useManualConnectorRunCompletion({
          enabled: true,
          dataMartId: 'dm-1',
          trackedRunId: terminalRun.id,
          runs: [],
          getDataMartRunById,
          resetManualRunTriggered,
          onCompleted,
        }),
      { wrapper }
    );

    await vi.waitFor(() => {
      expect(getDataMartRunById).toHaveBeenCalledTimes(1);
    });
    expect(resetManualRunTriggered).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    await vi.waitFor(() => {
      expect(resetManualRunTriggered).toHaveBeenCalledTimes(1);
    });
    expect(resetManualRunTriggered).toHaveBeenCalledWith(terminalRun);
  });
});

function createRun(status: DataMartRunStatus): DataMartRunItem {
  return {
    id: 'manual-run-1',
    status,
    type: DataMartRunType.CONNECTOR,
    triggerType: DataMartRunTriggerType.MANUAL,
    createdAt: new Date('2026-07-16T12:00:00.000Z'),
  } as DataMartRunItem;
}
