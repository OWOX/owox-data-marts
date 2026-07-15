import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelCanvas } from './use-model-canvas';

const serviceMocks = vi.hoisted(() => ({
  getDataMarts: vi.fn(),
  getEdges: vi.fn(),
}));

vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useParams: () => ({ projectId: 'project-1' }),
}));

vi.mock('../api/model-canvas.service', () => ({
  modelCanvasService: serviceMocks,
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useModelCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.getEdges.mockResolvedValue([]);
  });

  afterEach(() => vi.useRealTimers());

  it('passes the query abort signal through both requests', async () => {
    serviceMocks.getDataMarts.mockResolvedValue([]);

    const { result } = renderHook(() => useModelCanvas('storage-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const nodeConfig = serviceMocks.getDataMarts.mock.calls[0]?.[1];
    const edgeConfig = serviceMocks.getEdges.mock.calls[0]?.[1];
    expect(nodeConfig?.signal).toBeInstanceOf(AbortSignal);
    expect(edgeConfig?.signal).toBe(nodeConfig?.signal);
    expect(nodeConfig).toMatchObject({
      skipLoadingIndicator: true,
      skipErrorToast: true,
    });
    expect(edgeConfig).toMatchObject({
      skipLoadingIndicator: true,
      skipErrorToast: true,
    });
  });

  it('aborts the inactive request when the selected storage changes', async () => {
    let firstSignal: AbortSignal | undefined;
    serviceMocks.getDataMarts
      .mockImplementationOnce((_storageId: string, config: { signal?: AbortSignal }) => {
        firstSignal = config.signal;
        return new Promise(() => undefined);
      })
      .mockResolvedValueOnce([]);

    const { rerender } = renderHook(({ storageId }) => useModelCanvas(storageId), {
      initialProps: { storageId: 'storage-1' },
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(serviceMocks.getDataMarts).toHaveBeenCalledTimes(1);
    });
    rerender({ storageId: 'storage-2' });

    await waitFor(() => {
      expect(serviceMocks.getDataMarts).toHaveBeenCalledTimes(2);
    });
    expect(firstSignal?.aborted).toBe(true);
  });

  it('polls while any canvas node has an active quality run and stops at terminal state', async () => {
    vi.useFakeTimers();
    serviceMocks.getDataMarts
      .mockResolvedValueOnce([canvasNode('RUNNING')])
      .mockResolvedValue([canvasNode('PASSED')]);

    const { result } = renderHook(() => useModelCanvas('storage-1'), {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      expect(result.current.data?.nodes[0]?.qualitySummary.state).toBe('RUNNING');
    });
    expect(serviceMocks.getDataMarts).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await vi.waitFor(() => {
      expect(result.current.data?.nodes[0]?.qualitySummary.state).toBe('PASSED');
    });
    expect(serviceMocks.getDataMarts).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(serviceMocks.getDataMarts).toHaveBeenCalledTimes(2);
  });
});

function canvasNode(state: 'RUNNING' | 'PASSED') {
  return {
    id: 'mart-1',
    title: 'Orders',
    status: 'PUBLISHED',
    description: null,
    fieldCount: 3,
    qualitySummary: {
      state,
      enabledChecks: 1,
      totalChecks: 1,
      passedChecks: state === 'PASSED' ? 1 : 0,
      failedChecks: 0,
      notApplicableChecks: 0,
      errorChecks: 0,
      noticeFindings: 0,
      warningFindings: 0,
      errorFindings: 0,
      violationCount: 0,
      highestSeverity: null,
      dataMartRunId: 'run-1',
      lastRunAt: '2026-07-16T10:00:00.000Z',
    },
  };
}
