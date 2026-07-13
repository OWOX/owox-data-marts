import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
